import type { RequestContext } from "../../../lib/access.js";
import { runAudited } from "../../../lib/audit.js";
import { auth } from "../../../lib/auth.js";
import { emailChangedNotice } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { assertLoginEmailAvailable } from "../convites/service.js";
import type { UserRepository, UserWithAssignments } from "./repository.js";
import type { ChangeEmailInput } from "./schemas.js";

export class UserNotFoundError extends Error {
  constructor() {
    super("USER_NOT_FOUND");
  }
}

function mapUser(user: UserWithAssignments) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    personId: user.person?.id ?? null,
    personName: user.person?.name ?? null,
    assignments: user.assignments.map(({ organization, profile }) => ({
      organizationId: organization.id,
      organizationName: organization.name,
      profileId: profile.id,
      profileName: profile.name,
    })),
  };
}

// Lista básica (RF-US01 parcial) e troca de e-mail pelo admin (RF-RS04).
// Editar atribuições, desativar e encerrar sessões ficam na Sprint 8.
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async list(organizationIds: string[]) {
    const users = await this.repository.findAll(organizationIds);
    return users.map(mapUser);
  }

  // Troca o e-mail de login (e da pessoa), encerra as sessões, avisa o e-mail antigo e
  // manda ao novo um link para definir a senha (Segurança e sessão › Encerramento imediato).
  async changeEmail(context: RequestContext, organizationIds: string[], id: string, input: ChangeEmailInput) {
    if (id === context.actor.userId) {
      throw new AppError(400, "OWN_ACCESS", "Para trocar o seu próprio e-mail, peça a outro administrador.");
    }

    const { before, after } = await runAudited(context.actor, async (tx, audit) => {
      const user = await this.repository.findById(id, organizationIds, tx);
      if (!user) throw new UserNotFoundError();

      if (input.email === user.email) {
        throw new AppError(400, "SAME_EMAIL", "O e-mail novo é igual ao atual.");
      }

      await assertLoginEmailAvailable(tx, input.email, context.churchId);

      await tx.user.update({ where: { id }, data: { email: input.email } });
      if (user.person) {
        await tx.person.update({ where: { id: user.person.id }, data: { email: input.email } });
      }
      await tx.session.deleteMany({ where: { userId: id } });

      await audit([
        {
          organizationId: context.churchId,
          module: "ACESSO",
          action: "trocar_email_usuario",
          targetType: "User",
          targetId: id,
          before: { email: user.email },
          after: { email: input.email },
        },
        ...(user.person
          ? [
              {
                organizationId: user.person.organizationId,
                module: "PESSOAS" as const,
                action: "editar_pessoa",
                targetType: "Person",
                targetId: user.person.id,
                before: { email: user.person.email },
                after: { email: input.email },
              },
            ]
          : []),
      ]);

      return { before: user, after: (await this.repository.findById(id, organizationIds, tx))! };
    });

    const church = await prisma.organization.findUnique({ where: { id: context.churchId }, select: { name: true } });
    await trySendMail(
      emailChangedNotice({ to: before.email, name: before.name, newEmail: input.email, churchName: church?.name ?? null }),
    );
    // Link de definir senha (1h) no e-mail novo, pelo fluxo de redefinição do Better Auth.
    await auth.api.requestPasswordReset({ body: { email: input.email } });

    return mapUser(after);
  }
}

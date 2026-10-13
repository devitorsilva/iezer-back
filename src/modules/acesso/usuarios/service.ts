import type { AccessibleOrganization, RequestContext } from "../../../lib/access.js";
import { runAudited } from "../../../lib/audit.js";
import { auth } from "../../../lib/auth.js";
import { emailChangedNotice } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { assertLoginEmailAvailable } from "../convites/service.js";
import { assertCanChangeAssignments, runGuarded, type AssignmentData } from "../travas.js";
import type { UserRepository, UserWithAssignments } from "./repository.js";
import type { ChangeEmailInput, UpdateAssignmentsInput } from "./schemas.js";

export class UserNotFoundError extends Error {
  constructor() {
    super("USER_NOT_FOUND");
  }
}

function outOfReachError() {
  return new AppError(
    403,
    "PERMISSION_DENIED",
    "Este usuário também tem acesso em organizações que você não gerencia. Peça a um administrador da sede.",
  );
}

export class PersonNotFoundError extends Error {
  constructor() {
    super("PERSON_NOT_FOUND");
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
    personStatus: user.person?.status ?? null,
    assignments: user.assignments.map(({ organization, profile }) => ({
      organizationId: organization.id,
      organizationName: organization.name,
      profileId: profile.id,
      profileName: profile.name,
    })),
  };
}

// Quem edita: organizações alcançadas com as permissões efetivas de cada uma.
export interface UserManageContext extends RequestContext {
  organizations: AccessibleOrganization[];
}

const assignmentKey = (item: AssignmentData) => `${item.organizationId}:${item.profileId}`;

const managedIds = (context: UserManageContext) =>
  context.organizations.filter((org) => org.permissions.has("acesso.usuarios.gerenciar")).map((org) => org.id);

// Ninguém altera o próprio acesso (Acesso › Travas de segurança): evita autoconcessão.
function assertNotSelf(context: RequestContext, id: string) {
  if (id === context.actor.userId) {
    throw new AppError(400, "OWN_ACCESS", "Você não pode alterar o seu próprio acesso. Peça a outro administrador.");
  }
}

// Lista (RF-US01), editar acessos (RF-US02), desativar e reativar (RF-US03), encerrar sessões
// (RF-US05) e troca de e-mail pelo admin (RF-RS04).
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async list(organizationIds: string[]) {
    const users = await this.repository.findAll(organizationIds);
    return users.map(mapUser);
  }

  // Aba Acesso do perfil (RF-US06): a pessoa precisa estar nas organizações que o usuário lê.
  async findForPerson(readOrganizationIds: string[], organizationIds: string[], personId: string) {
    if (!(await this.repository.personExists(personId, readOrganizationIds))) throw new PersonNotFoundError();
    const user = await this.repository.findByPersonId(personId, organizationIds);
    return user ? mapUser(user) : null;
  }

  async updateAssignments(context: UserManageContext, id: string, input: UpdateAssignmentsInput) {
    assertNotSelf(context, id);
    const managed = managedIds(context);
    const managedSet = new Set(managed);

    return runGuarded(context.actor, context.churchId, async (tx, audit) => {
      const user = await this.repository.findById(id, managed, tx);
      if (!user) throw new UserNotFoundError();

      const current = await this.repository.findChurchAssignments(id, context.churchId, tx);
      const currentKeys = new Set(current.map(assignmentKey));
      const desired = [
        ...new Map(
          input.assignments
            .flatMap(({ organizationId, profileIds }) => profileIds.map((profileId) => ({ organizationId, profileId })))
            .map((item) => [assignmentKey(item), item]),
        ).values(),
      ];
      const desiredKeys = new Set(desired.map(assignmentKey));

      const added = desired.filter((item) => !currentKeys.has(assignmentKey(item)));
      const removed = current.filter((item) => managedSet.has(item.organizationId) && !desiredKeys.has(assignmentKey(item)));

      await assertCanChangeAssignments(tx, context.churchId, context.organizations, added);
      await assertCanChangeAssignments(tx, context.churchId, context.organizations, removed, "retirar");

      if (current.length - removed.length + added.length === 0) {
        throw new AppError(
          400,
          "NO_ASSIGNMENTS",
          "O usuário precisa ter ao menos um perfil. Para tirar todo o acesso, use \"Desativar acesso\".",
          { field: "assignments" },
        );
      }

      await this.repository.replaceAssignments(id, removed, added, tx);
      const after = mapUser(await this.repository.reload(id, managed, tx));

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: "editar_acessos_usuario",
        targetType: "User",
        targetId: id,
        before: { assignments: mapUser(user).assignments },
        after: { assignments: after.assignments },
      });

      return after;
    });
  }

  // Desativar (RF-US03): não entra mais, sessões encerradas, a Pessoa não muda. Afeta a conta
  // inteira, então quem desativa precisa alcançar todas as atribuições dela, protegidas inclusive.
  async deactivate(context: UserManageContext, id: string) {
    return this.changeStatus(context, id, "DESATIVADO");
  }

  // Reativar volta a ATIVO (de DESATIVADO ou SUSPENSO); devolve as protegidas, que quem reativa precisa ter.
  async reactivate(context: UserManageContext, id: string) {
    return this.changeStatus(context, id, "ATIVO");
  }

  // Encerrar sessões (RF-US05) sem mudar o status.
  async endSessions(context: UserManageContext, id: string) {
    assertNotSelf(context, id);
    const managed = managedIds(context);

    return runAudited(context.actor, async (tx, audit) => {
      const user = await this.repository.findById(id, managed, tx);
      if (!user) throw new UserNotFoundError();

      const current = await this.repository.findChurchAssignments(id, context.churchId, tx);
      if (current.some((item) => !managed.includes(item.organizationId))) throw outOfReachError();

      const count = await this.repository.deleteSessions(id, tx);

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: "encerrar_sessoes_usuario",
        targetType: "User",
        targetId: id,
        description: `${count} sessão(ões) encerrada(s)`,
      });

      return { sessionsEnded: count };
    });
  }

  private async changeStatus(context: UserManageContext, id: string, status: "ATIVO" | "DESATIVADO") {
    assertNotSelf(context, id);
    const managed = managedIds(context);

    return runGuarded(context.actor, context.churchId, async (tx, audit) => {
      const user = await this.repository.findById(id, managed, tx);
      if (!user) throw new UserNotFoundError();

      if (user.status === status) {
        throw new AppError(
          400,
          "INVALID_STATUS",
          status === "ATIVO" ? "Este acesso já está ativo." : "Este acesso já está desativado.",
        );
      }

      // RF-US04: acesso de pessoa que não está Ativa não volta; reative a pessoa antes.
      if (status === "ATIVO" && user.person && user.person.status !== "ATIVO") {
        throw new AppError(
          409,
          "PERSON_NOT_ACTIVE",
          "A pessoa deste acesso não está ativa em Pessoas. Reative a pessoa antes de reativar o acesso.",
        );
      }

      const current = await this.repository.findChurchAssignments(id, context.churchId, tx);
      if (current.some((item) => !managed.includes(item.organizationId))) throw outOfReachError();
      await assertCanChangeAssignments(
        tx,
        context.churchId,
        context.organizations,
        current,
        status === "ATIVO" ? "conceder" : "retirar",
      );

      await this.repository.setStatus(id, status, tx);
      if (status === "DESATIVADO") await this.repository.deleteSessions(id, tx);

      await audit({
        organizationId: context.churchId,
        module: "ACESSO",
        action: status === "ATIVO" ? "reativar_usuario" : "desativar_usuario",
        targetType: "User",
        targetId: id,
        before: { status: user.status },
        after: { status },
      });

      return mapUser(await this.repository.reload(id, managed, tx));
    });
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

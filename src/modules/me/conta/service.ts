import { fromNodeHeaders } from "better-auth/node";
import { isAPIError } from "better-auth/api";
import type { IncomingHttpHeaders } from "node:http";
import { recordAccountEvent } from "../../../lib/account-events.js";
import { runAudited, type AuditActor } from "../../../lib/audit.js";
import { auth } from "../../../lib/auth.js";
import { findUserChurch } from "../../../lib/church.js";
import { describeDevice } from "../../../lib/devices.js";
import { EMAIL_CHANGE_TTL_MS, emailChangeConfirmEmail, emailChangedNotice, passwordChangedEmail } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { assertValidNewPassword } from "../../../lib/password-rules.js";
import { prisma } from "../../../lib/prisma.js";
import { isRateLimited } from "../../../lib/rate-limit.js";
import { generateToken, hashToken } from "../../../lib/tokens.js";
import { requiresTwoFactor } from "../../../lib/two-factor.js";
import { summarizePermissions } from "../../acesso/permissoes/catalog/index.js";
import { assertLoginEmailAvailable } from "../../acesso/convites/service.js";
import type { AccountRepository } from "./repository.js";
import type { ChangeEmailInput, ChangePasswordInput } from "./schemas.js";

export interface AccountContext {
  userId: string;
  sessionId: string;
  actor: AuditActor;
  headers: IncomingHttpHeaders;
}

const EMAIL_CHANGE_INVALID = "Este link de confirmação é inválido ou expirou. Peça a troca de novo em Minha conta.";

// As mensagens de assertLoginEmailAvailable falam com o admin; aqui é o próprio usuário.
async function assertEmailAvailable(...args: Parameters<typeof assertLoginEmailAvailable>) {
  try {
    await assertLoginEmailAvailable(...args);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 409) {
      throw new AppError(409, "EMAIL_IN_USE", "Este e-mail já é usado por outro acesso do iEzer.", { field: "email" });
    }
    throw error;
  }
}

// Minha conta (RF-MC01 a RF-MC06): segurança, senha, sessões, meus acessos e troca de e-mail.
export class AccountService {
  constructor(private readonly repository: AccountRepository) {}

  private async findUserOrThrow(userId: string) {
    const user = await this.repository.findUser(userId);
    if (!user) throw new AppError(401, "UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
    return user;
  }

  // Estado do 2FA e das formas de login, para Minha conta e a configuração obrigatória.
  async security(userId: string) {
    const user = await this.findUserOrThrow(userId);

    return {
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorRequired: await requiresTwoFactor(userId),
      // App autenticador configurado (o código por e-mail não guarda segredo).
      totpEnabled: user.twoFactors.some((item) => item.verified),
      hasPassword: user.accounts.some((account) => account.providerId === "credential" && account.password),
      hasGoogle: user.accounts.some((account) => account.providerId === "google"),
    };
  }

  // Trocar a senha (pede a atual) ou definir uma, para quem só usa Google (RF-MC02). Trocar
  // encerra as outras sessões (Encerramento imediato). Devolve os cookies da sessão nova.
  async changePassword(context: AccountContext, input: ChangePasswordInput) {
    const user = await this.findUserOrThrow(context.userId);
    const hasPassword = user.accounts.some((account) => account.providerId === "credential" && account.password);
    const church = await findUserChurch(context.userId);

    if (hasPassword && !input.currentPassword) {
      throw new AppError(400, "CURRENT_PASSWORD_REQUIRED", "Informe a senha atual.", { field: "currentPassword" });
    }

    await assertValidNewPassword(input.newPassword, { email: user.email, churchName: church?.name });
    const headers = fromNodeHeaders(context.headers);
    let cookies: string[] = [];

    try {
      if (hasPassword) {
        const result = await auth.api.changePassword({
          body: { currentPassword: input.currentPassword!, newPassword: input.newPassword, revokeOtherSessions: true },
          headers,
          returnHeaders: true,
        });
        cookies = result.headers.getSetCookie();
      } else {
        await auth.api.setPassword({ body: { newPassword: input.newPassword }, headers });
      }
    } catch (error) {
      if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
        throw new AppError(400, "INVALID_PASSWORD", "A senha atual não confere.", { field: "currentPassword" });
      }
      throw error;
    }

    await recordAccountEvent({
      actor: context.actor,
      userId: context.userId,
      action: hasPassword ? "trocar_senha" : "definir_senha",
      notice: (target) => passwordChangedEmail({ ...target, kind: hasPassword ? "alterada" : "definida" }),
    });

    return { cookies, result: { hasPassword: true } };
  }

  // Sessões ativas (RF-MC04). O último uso acompanha a renovação da sessão (uma vez por dia).
  async listSessions(context: AccountContext) {
    const sessions = await this.repository.listSessions(context.userId);

    return sessions.map((session) => ({
      id: session.id,
      device: describeDevice(session.userAgent),
      ipAddress: session.ipAddress || null,
      location: session.location,
      pendingTwoFactor: session.twoFactorPending,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.updatedAt.toISOString(),
      current: session.id === context.sessionId,
    }));
  }

  async endSession(context: AccountContext, id: string) {
    if (id === context.sessionId) {
      throw new AppError(400, "CURRENT_SESSION", "Para encerrar esta sessão, use Sair.");
    }

    const church = await findUserChurch(context.userId);

    return runAudited(context.actor, async (tx, audit) => {
      const count = await this.repository.deleteSession(context.userId, id, tx);
      if (count === 0) throw new AppError(404, "SESSION_NOT_FOUND", "Sessão não encontrada ou já encerrada.");

      await audit({
        organizationId: church?.id ?? null,
        module: "ACESSO",
        action: "encerrar_sessao",
        targetType: "User",
        targetId: context.userId,
      });

      return { sessionsEnded: count };
    });
  }

  async endOtherSessions(context: AccountContext) {
    const church = await findUserChurch(context.userId);

    return runAudited(context.actor, async (tx, audit) => {
      const count = await this.repository.deleteOtherSessions(context.userId, context.sessionId, tx);

      await audit({
        organizationId: church?.id ?? null,
        module: "ACESSO",
        action: "encerrar_outras_sessoes",
        targetType: "User",
        targetId: context.userId,
        description: `${count} sessão(ões) encerrada(s)`,
      });

      return { sessionsEnded: count };
    });
  }

  // Meus acessos (RF-MC05): perfis por organização e o resumo das permissões somadas ali.
  async myAccess(userId: string) {
    const assignments = await this.repository.findAssignments(userId);
    const byOrganization = new Map<
      string,
      { organizationId: string; organizationName: string; type: string; profiles: string[]; keys: Set<string> }
    >();

    for (const { organization, profile } of assignments) {
      const entry = byOrganization.get(organization.id) ?? {
        organizationId: organization.id,
        organizationName: organization.name,
        type: organization.type,
        profiles: [],
        keys: new Set<string>(),
      };
      entry.profiles.push(profile.name);
      for (const { permissionKey } of profile.permissions) entry.keys.add(permissionKey);
      byOrganization.set(organization.id, entry);
    }

    return {
      items: [...byOrganization.values()].map(({ keys, ...entry }) => ({
        ...entry,
        permissions: summarizePermissions(keys),
      })),
    };
  }

  // Trocar o e-mail de login (RF-MC06): link de confirmação (1h) no e-mail novo. A troca só
  // acontece na confirmação, que avisa o antigo.
  async requestEmailChange(context: AccountContext, input: ChangeEmailInput) {
    const user = await this.findUserOrThrow(context.userId);

    if (input.email === user.email) {
      throw new AppError(400, "SAME_EMAIL", "O e-mail novo é igual ao atual.");
    }

    if (isRateLimited(`email-change:${context.userId}`, 3, 60 * 60 * 1000)) {
      throw new AppError(429, "RATE_LIMITED", "Muitos pedidos de troca de e-mail. Tente de novo mais tarde.");
    }

    const church = await findUserChurch(context.userId);
    await assertEmailAvailable(prisma, input.email, church?.id ?? "");

    const { token, tokenHash } = generateToken();
    await this.repository.saveEmailChange(
      tokenHash,
      { userId: user.id, email: input.email, oldEmail: user.email },
      new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
    );

    const emailSent = await trySendMail(
      emailChangeConfirmEmail({ to: input.email, name: user.name, churchName: church?.name ?? null, token }),
    );

    return { email: input.email, emailSent };
  }

  // Confirmação pelo link (rota pública: pode abrir em outro aparelho). Troca o login, também o
  // e-mail da pessoa quando era o mesmo, e encerra as sessões (Encerramento imediato).
  async confirmEmailChange(token: string, meta: { ip: string | null; userAgent: string | null }) {
    const request = await this.repository.findEmailChange(hashToken(token));
    if (!request) throw new AppError(404, "EMAIL_CHANGE_INVALID", EMAIL_CHANGE_INVALID);

    const church = await findUserChurch(request.userId);
    const actor: AuditActor = { type: "USUARIO", userId: request.userId, ip: meta.ip, userAgent: meta.userAgent };

    const user = await runAudited(actor, async (tx, audit) => {
      if (!(await this.repository.consumeEmailChange(request.id, tx))) {
        throw new AppError(404, "EMAIL_CHANGE_INVALID", EMAIL_CHANGE_INVALID);
      }

      const user = await this.repository.findUser(request.userId, tx);
      if (!user || user.email !== request.oldEmail) {
        throw new AppError(404, "EMAIL_CHANGE_INVALID", EMAIL_CHANGE_INVALID);
      }

      await assertEmailAvailable(tx, request.email, church?.id ?? "");

      await tx.user.update({ where: { id: user.id }, data: { email: request.email, emailVerified: true } });
      const syncPerson = user.person?.email === request.oldEmail;
      if (syncPerson) {
        await tx.person.update({ where: { id: user.person!.id }, data: { email: request.email } });
      }
      await tx.session.deleteMany({ where: { userId: user.id } });

      await audit([
        {
          organizationId: church?.id ?? null,
          module: "ACESSO",
          action: "trocar_email",
          targetType: "User",
          targetId: user.id,
          before: { email: request.oldEmail },
          after: { email: request.email },
        },
        ...(syncPerson
          ? [
              {
                organizationId: user.person!.organizationId,
                module: "PESSOAS" as const,
                action: "editar_pessoa",
                targetType: "Person",
                targetId: user.person!.id,
                before: { email: request.oldEmail },
                after: { email: request.email },
              },
            ]
          : []),
      ]);

      return user;
    });

    await trySendMail(
      emailChangedNotice({
        to: request.oldEmail,
        name: user.name,
        newEmail: request.email,
        churchName: church?.name ?? null,
        self: true,
      }),
    );

    return { email: request.email };
  }
}

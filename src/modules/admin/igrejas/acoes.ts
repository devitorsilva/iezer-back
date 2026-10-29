import { runAudited, type AuditActor } from "../../../lib/audit.js";
import { findUserChurch } from "../../../lib/church.js";
import { adminRecoveryNotice, teamActionNotice, twoFactorChangedNotice } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { clearLoginFailures, findLoginLock } from "../../../lib/login-lock.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { normalizeSearchText } from "../../../lib/text.js";
import { inviteService } from "../../acesso/convites/routes.js";
import { supportAdmins } from "../../acesso/suporte/service.js";
import { ADMIN_PERMISSION } from "../../acesso/travas.js";
import type { RecoverAdminInput, ResetTwoFactorInput, TeamActionInput } from "./schemas.js";
import { ChurchAdminNotFoundError } from "./service.js";

// Ações sem acesso aos dados (B9, RF-BO30 a RF-BO33): resolvem o chamado sem abrir dados da igreja.
// Sempre com motivo e chamado opcional no log da igreja como "Suporte iEzer", e aviso ao responsável
// pela conta depois do commit.

const inChurch = (churchId: string) => ({ OR: [{ id: churchId }, { parentId: churchId }] });

async function findChurch(churchId: string) {
  const church = await prisma.organization.findFirst({
    where: { id: churchId, type: "SEDE", parentId: null },
    select: {
      id: true,
      name: true,
      contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } },
    },
  });
  if (!church) throw new ChurchAdminNotFoundError("church");
  return church;
}

// Usuário da igreja (com atribuição na sede ou numa congregação); `isAdmin` pela regra das travas.
async function findChurchUser(churchId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, teamMember: null, assignments: { some: { organization: inChurch(churchId) } } },
    select: {
      id: true,
      name: true,
      email: true,
      twoFactorEnabled: true,
      assignments: {
        where: { profile: { organizationId: churchId, permissions: { some: { permissionKey: ADMIN_PERMISSION } } } },
        select: { id: true },
      },
    },
  });
  if (!user) throw new ChurchAdminNotFoundError("user");
  return { ...user, isAdmin: user.assignments.length > 0 };
}

const describe = (input: TeamActionInput & { verification?: string }) =>
  [
    `Motivo: ${input.reason}`,
    input.ticket ? `Chamado: ${input.ticket}` : null,
    input.verification ? `Verificação: ${input.verification}` : null,
  ]
    .filter(Boolean)
    .join(". ");

async function agentName(actor: AuditActor) {
  if (!actor.userId) return "Suporte iEzer";
  const user = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } });
  return user?.name ?? "Suporte iEzer";
}

async function notifyOwner(
  church: Awaited<ReturnType<typeof findChurch>>,
  actor: AuditActor,
  action: string,
  input: TeamActionInput,
) {
  const owner = church.contacts[0];
  if (!owner) return false;
  return trySendMail(
    teamActionNotice({
      to: owner.email,
      name: owner.name,
      churchName: church.name,
      agentName: await agentName(actor),
      action,
      reason: input.reason,
      ticket: input.ticket ?? null,
    }),
  );
}

// Redefinir o 2FA de um admin da igreja (RF-BO30), como o admin faz pela tela de Usuários (RF-RS05):
// apaga o segredo e os códigos, encerra as sessões; no próximo login ele configura de novo.
export async function resetAdminTwoFactor(actor: AuditActor, churchId: string, userId: string, input: ResetTwoFactorInput) {
  const church = await findChurch(churchId);
  const user = await findChurchUser(churchId, userId);

  if (!user.isAdmin) {
    throw new AppError(
      409,
      "NOT_CHURCH_ADMIN",
      "O back-office só redefine o 2FA de administradores. Os demais usuários pedem ao admin da igreja.",
    );
  }
  if (!user.twoFactorEnabled) {
    throw new AppError(409, "TWO_FACTOR_DISABLED", "Este usuário não usa a verificação em duas etapas.");
  }

  const sessionsEnded = await runAudited(actor, async (tx, audit) => {
    await tx.twoFactor.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } });
    const { count } = await tx.session.deleteMany({ where: { userId } });
    await audit({
      organizationId: churchId,
      module: "ACESSO",
      action: "suporte_redefinir_2fa",
      targetType: "User",
      targetId: userId,
      description: describe(input),
      before: { twoFactorEnabled: true },
      after: { twoFactorEnabled: false, sessionsEnded: count },
    });
    return count;
  });

  await trySendMail(
    twoFactorChangedNotice({
      to: user.email,
      name: user.name,
      churchName: church.name,
      change: "redefinida",
      by: "O suporte do iEzer",
    }),
  );
  const ownerNotified = await notifyOwner(
    church,
    actor,
    `redefiniu a verificação em duas etapas de ${user.name} (${user.email})`,
    input,
  );

  return { sessionsEnded, ownerNotified };
}

// Destravar o login bloqueado por tentativas erradas (RF-BO31).
export async function unlockLogin(actor: AuditActor, churchId: string, userId: string, input: TeamActionInput) {
  const church = await findChurch(churchId);
  const user = await findChurchUser(churchId, userId);

  const lockedUntil = await findLoginLock(user.email);
  if (!lockedUntil) throw new AppError(409, "LOGIN_NOT_LOCKED", "O login deste usuário não está bloqueado.");

  await runAudited(actor, async (_tx, audit) => {
    await clearLoginFailures(user.email);
    await audit({
      organizationId: churchId,
      module: "ACESSO",
      action: "suporte_destravar_login",
      targetType: "User",
      targetId: userId,
      description: describe(input),
      before: { lockedUntil: lockedUntil.toISOString() },
      after: { lockedUntil: null },
    });
  });

  const ownerNotified = await notifyOwner(church, actor, `destravou o login de ${user.name} (${user.email})`, input);
  return { ownerNotified };
}

// Recuperação de admin (RF-BO33, RF-SP10), com as regras de antes: usuário ativo da igreja ganha o
// perfil Pastor na sede; senão, a pessoa (achada pelo e-mail ou criada na sede) recebe o convite.
// Nomeação no log e aviso aos admins atuais e ao responsável pela conta.
export async function recoverAdmin(actor: AuditActor, churchId: string, input: RecoverAdminInput) {
  const church = await findChurch(churchId);
  const pastor = await prisma.accessProfile.findUnique({
    where: { organizationId_factoryKey: { organizationId: churchId, factoryKey: "PASTOR" } },
    select: { id: true },
  });
  if (!pastor) throw new AppError(409, "PASTOR_PROFILE_MISSING", "A igreja não tem o perfil Pastor de fábrica.");

  const previousAdmins = await supportAdmins(churchId);
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, status: true, teamMember: { select: { id: true } } },
  });
  const description = describe(input);

  let result: { adminName: string; viaInvite: boolean; emailSent: boolean };

  if (existingUser) {
    const userChurch = await findUserChurch(existingUser.id);
    if (existingUser.teamMember || userChurch?.id !== churchId) {
      throw new AppError(409, "USER_OTHER_CHURCH", "Este e-mail é de um usuário de fora desta igreja.");
    }
    if (existingUser.status !== "ATIVO") {
      throw new AppError(
        409,
        "USER_NOT_ACTIVE",
        "Este usuário está desativado ou suspenso. Confira a situação da pessoa com o responsável pela conta.",
      );
    }

    await runAudited(actor, async (tx, audit) => {
      const { count } = await tx.userAssignment.createMany({
        data: [{ userId: existingUser.id, organizationId: churchId, profileId: pastor.id }],
        skipDuplicates: true,
      });
      if (count === 0) {
        throw new AppError(409, "ALREADY_ADMIN", `${existingUser.name} já tem o perfil Pastor na sede.`);
      }
      await audit({
        organizationId: churchId,
        module: "ACESSO",
        action: "suporte_recuperar_admin",
        targetType: "User",
        targetId: existingUser.id,
        description,
        after: { name: existingUser.name, email: input.email, profile: "Pastor", viaInvite: false },
      });
    });

    result = { adminName: existingUser.name, viaInvite: false, emailSent: false };
  } else {
    const person = await runAudited(actor, async (tx, audit) => {
      const person =
        (await tx.person.findFirst({
          where: { email: input.email, organization: inChurch(churchId) },
          select: { id: true, name: true },
        })) ??
        (await tx.person.create({
          data: {
            organizationId: churchId,
            name: input.name,
            searchName: normalizeSearchText(input.name),
            email: input.email,
            mobilePhone: input.mobilePhone ?? null,
            bond: "MEMBRO",
            status: "ATIVO",
          },
          select: { id: true, name: true },
        }));

      await audit({
        organizationId: churchId,
        module: "ACESSO",
        action: "suporte_recuperar_admin",
        targetType: "Person",
        targetId: person.id,
        description,
        after: { name: person.name, email: input.email, profile: "Pastor", viaInvite: true },
      });
      return person;
    });

    // O link do convite não volta para a equipe (B8): só o e-mail ao novo admin.
    const context = { churchId, actor, organizations: null };
    const pending = await prisma.invite.findFirst({
      where: { personId: person.id, status: "PENDENTE", expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    const invite = pending
      ? await inviteService.resend(context, pending.id, true)
      : await inviteService.create(context, {
          personId: person.id,
          assignments: [{ organizationId: churchId, profileIds: [pastor.id] }],
        });

    result = { adminName: person.name, viaInvite: true, emailSent: invite.emailSent };
  }

  const recipients = new Map(
    [...church.contacts, ...previousAdmins].map((recipient) => [recipient.email.toLowerCase(), recipient]),
  );
  recipients.delete(input.email);
  const agent = await agentName(actor);
  await Promise.all(
    [...recipients.values()].map((recipient) =>
      trySendMail(
        adminRecoveryNotice({
          to: recipient.email,
          name: recipient.name,
          churchName: church.name,
          adminName: result.adminName,
          agentName: agent,
          viaInvite: result.viaInvite,
        }),
      ),
    ),
  );

  return result;
}

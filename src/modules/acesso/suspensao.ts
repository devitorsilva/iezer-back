import type { Prisma } from "@prisma/client";
import type { AuditWriter } from "../../lib/audit.js";
import { accessSuspendedNotice } from "../../lib/emails.js";
import { trySendMail } from "../../lib/mailer.js";
import { churchWithoutAdminNotice } from "../../lib/team-emails.js";
import { teamRecipients } from "../../lib/team.js";
import { prisma } from "../../lib/prisma.js";
import { ADMIN_PERMISSION, snapshotProtected } from "./travas.js";

type Db = Prisma.TransactionClient;

export interface SuspendedUser {
  id: string;
  name: string;
  // Situação nova da pessoa, como aparece na tela (vai no aviso).
  reason: string;
}

// Suspensão automática (RF-US04, RT-AB13): chamada pelas ações de ciclo de vida de Pessoas na
// mesma transação. Só atinge acesso ATIVO (desativado continua desativado). Não passa pela trava
// do último admin: o acesso cai mesmo assim, e o aviso vai ao responsável pela conta
// (PRD Acesso › Travas de segurança).
export async function suspendPersonAccess(
  db: Db,
  personId: string,
  organizationId: string,
  reason: string,
  audit: AuditWriter,
): Promise<SuspendedUser | null> {
  const user = await db.user.findFirst({ where: { personId, status: "ATIVO" }, select: { id: true, name: true } });
  if (!user) return null;

  await db.user.update({ where: { id: user.id }, data: { status: "SUSPENSO" } });
  const { count } = await db.session.deleteMany({ where: { userId: user.id } });

  await audit({
    organizationId,
    module: "ACESSO",
    action: "suspender_usuario",
    targetType: "User",
    targetId: user.id,
    description: `Suspensão automática: situação da pessoa mudou para ${reason}; ${count} sessão(ões) encerrada(s)`,
    before: { status: "ATIVO" },
    after: { status: "SUSPENSO" },
    personIds: [personId],
  });

  return { ...user, reason };
}

const wasChurchAdmin = async (churchId: string, userId: string) =>
  (await prisma.userAssignment.count({
    where: { userId, profile: { organizationId: churchId, permissions: { some: { permissionKey: ADMIN_PERMISSION } } } },
  })) > 0;

// Depois do commit: avisa os admins ativos ou, se nenhum sobrou, o responsável pela conta e a
// equipe iEzer (Suporte e Administradores, B12).
export async function notifySuspension(churchId: string, suspended: SuspendedUser) {
  const snapshot = await snapshotProtected(prisma, churchId);
  const admins = [...snapshot.values()].filter((user) => user.keys.has(ADMIN_PERMISSION));
  const church = await prisma.organization.findUnique({
    where: { id: churchId },
    select: { name: true, contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } } },
  });

  const noAdminLeft = admins.length === 0;
  const recipients = noAdminLeft ? (church?.contacts ?? []) : admins;
  // A equipe só é avisada quando quem caiu era o último admin; sem nome nem situação da pessoa (B10).
  const wasLastAdmin = noAdminLeft && (await wasChurchAdmin(churchId, suspended.id));
  const team = wasLastAdmin ? await teamRecipients(["SUPORTE"]) : [];

  await Promise.all([
    ...team.map((member) =>
      trySendMail(
        churchWithoutAdminNotice({
          to: member.email,
          name: member.name,
          churchId,
          churchName: church?.name ?? "igreja",
          cause: "O último administrador teve o acesso suspenso automaticamente, por mudança na situação da pessoa.",
        }),
      ),
    ),
    ...recipients.map((recipient) =>
      trySendMail(
        accessSuspendedNotice({
          to: recipient.email,
          name: recipient.name,
          churchName: church?.name ?? null,
          userName: suspended.name,
          reason: suspended.reason,
          noAdminLeft,
        }),
      ),
    ),
  ]);
}

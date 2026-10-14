import type { Prisma } from "@prisma/client";
import type { AuditWriter } from "../../lib/audit.js";
import { accessSuspendedNotice } from "../../lib/emails.js";
import { trySendMail } from "../../lib/mailer.js";
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

// Depois do commit: avisa os admins ativos ou, se nenhum sobrou, o responsável pela conta.
// Ainda não há e-mail do suporte configurado; o caso fica no log.
export async function notifySuspension(churchId: string, suspended: SuspendedUser) {
  const snapshot = await snapshotProtected(prisma, churchId);
  const admins = [...snapshot.values()].filter((user) => user.keys.has(ADMIN_PERMISSION));
  const church = await prisma.organization.findUnique({
    where: { id: churchId },
    select: { name: true, contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } } },
  });

  const noAdminLeft = admins.length === 0;
  const recipients = noAdminLeft ? (church?.contacts ?? []) : admins;
  if (noAdminLeft) {
    console.warn(`[suspensão] igreja ${churchId} ficou sem administrador ativo (usuário ${suspended.id}); avisar o suporte.`);
  }

  await Promise.all(
    recipients.map((recipient) =>
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
  );
}

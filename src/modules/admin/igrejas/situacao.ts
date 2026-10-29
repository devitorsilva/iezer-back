import type { OrganizationStatus, Prisma } from "@prisma/client";
import { runAudited, type AuditActor } from "../../../lib/audit.js";
import { churchStatusNotice } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { ADMIN_PERMISSION } from "../../acesso/travas.js";
import { ChurchAdminNotFoundError } from "./service.js";

type Db = Prisma.TransactionClient;

export type ChurchStatusAction = "ativar" | "suspender" | "reativar";

const inChurch = (churchId: string) => ({ OR: [{ id: churchId }, { parentId: churchId }] });

// Admin ativo da igreja: usuário ATIVO com "Gerenciar perfis de acesso" numa organização ativa
// (a mesma regra das travas).
const activeAdminWhere = (churchId: string) =>
  ({
    status: "ATIVO",
    assignments: {
      some: {
        organization: { isActive: true },
        profile: { organizationId: churchId, permissions: { some: { permissionKey: ADMIN_PERMISSION } } },
      },
    },
  }) satisfies Prisma.UserWhereInput;

export function findActiveAdmins(churchId: string, db: Db = prisma) {
  return db.user.findMany({ where: activeAdminWhere(churchId), select: { name: true, email: true } });
}

export async function hasActiveAdmin(churchId: string, db: Db = prisma) {
  return (await db.user.count({ where: activeAdminWhere(churchId) })) > 0;
}

const ALLOWED_FROM: Record<ChurchStatusAction, OrganizationStatus[]> = {
  ativar: ["IMPLANTACAO"],
  suspender: ["IMPLANTACAO", "ATIVA"],
  reativar: ["SUSPENSA"],
};

const INVALID_FROM_MESSAGES: Record<ChurchStatusAction, string> = {
  ativar: "Só uma igreja em Implantação pode ser marcada como ativa.",
  suspender: "Só uma igreja em Implantação ou Ativa pode ser suspensa.",
  reativar: "Só uma igreja suspensa pode ser reativada.",
};

const AUDIT_ACTIONS: Record<ChurchStatusAction, string> = {
  ativar: "ativar_igreja",
  suspender: "suspender_igreja",
  reativar: "reativar_igreja",
};

// Situação da igreja (B5, RF-BO19 a RF-BO21, RT-BB04). Ativar exige admin ativo; suspender derruba
// as sessões de todos os usuários da igreja; reativar volta a Ativa (ou a Implantação, se a igreja
// ainda não tem admin ativo). E-mails depois do commit: suspensão ao responsável e aos admins; as
// outras, ao responsável.
export async function changeChurchStatus(
  actor: AuditActor,
  churchId: string,
  action: ChurchStatusAction,
  reason: string | null,
) {
  const result = await runAudited(actor, async (tx, audit) => {
    const church = await tx.organization.findFirst({
      where: { id: churchId, type: "SEDE", parentId: null },
      select: { id: true, name: true, status: true, statusReason: true, contacts: { where: { role: "RESPONSAVEL_CONTA" } } },
    });
    if (!church) throw new ChurchAdminNotFoundError("church");
    if (!ALLOWED_FROM[action].includes(church.status)) {
      throw new AppError(409, "CHURCH_STATUS_INVALID", INVALID_FROM_MESSAGES[action], { status: church.status });
    }

    const withAdmin = await hasActiveAdmin(church.id, tx);
    if (action === "ativar" && !withAdmin) {
      throw new AppError(
        409,
        "CHURCH_WITHOUT_ADMIN",
        "A igreja ainda não tem admin ativo. O primeiro admin precisa aceitar o convite antes.",
      );
    }

    const status: OrganizationStatus =
      action === "suspender" ? "SUSPENSA" : action === "reativar" && !withAdmin ? "IMPLANTACAO" : "ATIVA";

    // Trava contra duas mudanças ao mesmo tempo: só grava se a situação ainda é a lida.
    const statusChangedAt = new Date();
    const { count } = await tx.organization.updateMany({
      where: { id: church.id, status: church.status },
      data: { status, statusChangedAt, statusReason: reason },
    });
    if (count === 0) {
      throw new AppError(409, "CHURCH_STATUS_INVALID", "A situação da igreja mudou agora há pouco. Recarregue a página.");
    }

    // RF-BO20: as sessões da igreja caem. A checagem de sessão recusa as que sobrarem de um login
    // concorrente.
    const sessionsEnded =
      action === "suspender"
        ? (
            await tx.session.deleteMany({
              where: {
                user: {
                  teamMember: null,
                  OR: [
                    { assignments: { some: { organization: inChurch(church.id) } } },
                    { person: { organization: inChurch(church.id) } },
                  ],
                },
              },
            })
          ).count
        : 0;

    await audit({
      organizationId: church.id,
      module: "CONFIGURACOES",
      action: AUDIT_ACTIONS[action],
      targetType: "Organization",
      targetId: church.id,
      description: reason ? `Motivo: ${reason}` : undefined,
      before: { status: church.status, statusReason: church.statusReason },
      after: { status, statusReason: reason, ...(action === "suspender" ? { sessionsEnded } : {}) },
    });

    const admins = action === "suspender" ? await findActiveAdmins(church.id, tx) : [];
    return { church, status, statusChangedAt, admins };
  });

  const { church, status, statusChangedAt, admins } = result;
  const owner = church.contacts[0];
  const change = action === "ativar" ? "ATIVADA" : action === "suspender" ? "SUSPENSA" : "REATIVADA";
  const recipients = new Map<string, string>();
  if (owner) recipients.set(owner.email.toLowerCase(), owner.name);
  for (const admin of admins) {
    if (!recipients.has(admin.email.toLowerCase())) recipients.set(admin.email.toLowerCase(), admin.name);
  }

  const sent = await Promise.all(
    [...recipients].map(([to, name]) =>
      trySendMail(churchStatusNotice({ to, name, churchName: church.name, change, reason })),
    ),
  );

  return {
    status,
    statusChangedAt: statusChangedAt.toISOString(),
    statusReason: reason,
    emailsSent: sent.filter(Boolean).length,
  };
}

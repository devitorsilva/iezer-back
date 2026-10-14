import type { Prisma, SupportEmergencyKind } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditActor } from "../../../lib/audit.js";
import {
  supportAuthorizedNotice,
  supportEmergencyNotice,
  supportRequestNotice,
  type SupportGrantSummary,
} from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { churchUsersWith } from "../../../lib/support.js";
import { PERMISSION_MODULE_NAMES, type PermissionModule } from "../permissoes/catalog/index.js";
import type { SupportGrantRepository, SupportGrantRow } from "./repository.js";
import type { ApproveGrantInput, AuthorizeGrantInput, RefuseGrantInput } from "./schemas.js";

export class SupportGrantNotFoundError extends Error {
  constructor() {
    super("SUPPORT_GRANT_NOT_FOUND");
  }
}

export const EMERGENCY_KIND_LABELS: Record<SupportEmergencyKind, string> = {
  INCIDENTE: "incidente",
  ORDEM_JUDICIAL: "ordem judicial",
  IGREJA_SEM_ADMIN: "igreja sem administrador",
};

const HOUR_MS = 60 * 60 * 1000;

export const expiresIn = (hours: number, from = new Date()) => new Date(from.getTime() + hours * HOUR_MS);

const scopeNames = (scope: string[]) =>
  scope.map((module) => PERMISSION_MODULE_NAMES[module as PermissionModule] ?? module);

// Ativo vencido aparece como EXPIRADO (RF-SP08); o banco continua ATIVO.
export function grantStatus(grant: Pick<SupportGrantRow, "status" | "expiresAt">, now = new Date()) {
  return grant.status === "ATIVO" && grant.expiresAt && grant.expiresAt <= now ? "EXPIRADO" : grant.status;
}

const personName = (person: SupportGrantRow["requestedBy"]) =>
  person ? (person.teamMember ? `${person.name} (Suporte iEzer)` : person.name) : null;

export function mapGrant(grant: SupportGrantRow) {
  return {
    id: grant.id,
    churchId: grant.church.id,
    churchName: grant.church.name,
    origin: grant.origin,
    status: grantStatus(grant),
    emergencyKind: grant.emergencyKind,
    ticket: grant.ticket,
    reason: grant.reason,
    scope: grant.scope,
    scopeNames: scopeNames(grant.scope),
    canWrite: grant.canWrite,
    writeJustification: grant.writeJustification,
    durationHours: grant.durationHours,
    requestedAt: grant.requestedAt.toISOString(),
    requestedById: grant.requestedBy?.id ?? null,
    requestedByName: personName(grant.requestedBy),
    approvedAt: grant.approvedAt?.toISOString() ?? null,
    approvedByName: personName(grant.approvedBy),
    startsAt: grant.startsAt?.toISOString() ?? null,
    expiresAt: grant.expiresAt?.toISOString() ?? null,
    closedAt: grant.closedAt?.toISOString() ?? null,
    closedByName: personName(grant.closedBy),
    closeReason: grant.closeReason,
  };
}

export type SupportGrantDto = ReturnType<typeof mapGrant>;

// Retrato gravado no log de cada decisão: só o que a decisão muda ou explica.
export const grantSnapshot = (grant: SupportGrantRow) => {
  const dto = mapGrant(grant);
  return {
    status: dto.status,
    origin: dto.origin,
    emergencyKind: dto.emergencyKind,
    ticket: dto.ticket,
    reason: dto.reason,
    scope: dto.scopeNames,
    canWrite: dto.canWrite,
    writeJustification: dto.writeJustification,
    durationHours: dto.durationHours,
    expiresAt: dto.expiresAt,
    closeReason: dto.closeReason,
  };
};

const summary = (grant: SupportGrantRow): SupportGrantSummary => ({
  reason: grant.reason,
  ticket: grant.ticket,
  scopeNames: scopeNames(grant.scope),
  canWrite: grant.canWrite,
  writeJustification: grant.writeJustification,
});

// Admins avisados da autorização (RF-SP03): quem autoriza o suporte e quem gerencia perfis.
export const supportAdmins = (churchId: string) =>
  churchUsersWith(churchId, ["acesso.suporte.autorizar", "acesso.perfis.gerenciar"]);

export async function notifySupportRequest(grant: SupportGrantRow) {
  const approvers = await churchUsersWith(grant.church.id, ["acesso.suporte.autorizar"]);
  await Promise.all(
    approvers.map((user) =>
      trySendMail(
        supportRequestNotice({
          to: user.email,
          name: user.name,
          churchName: grant.church.name,
          agentName: grant.requestedBy?.name ?? "Suporte iEzer",
          durationHours: grant.durationHours,
          grant: summary(grant),
        }),
      ),
    ),
  );
  return approvers.length;
}

export async function notifySupportAuthorized(grant: SupportGrantRow) {
  const admins = await supportAdmins(grant.church.id);
  await Promise.all(
    admins.map((user) =>
      trySendMail(
        supportAuthorizedNotice({
          to: user.email,
          name: user.name,
          churchName: grant.church.name,
          authorizedBy: grant.approvedBy?.name ?? "Um administrador",
          expiresAt: grant.expiresAt!,
          grant: summary(grant),
        }),
      ),
    ),
  );
}

// Emergência: responsável pela conta e admins, sem repetir quem é as duas coisas (RF-SP09).
export async function notifySupportEmergency(grant: SupportGrantRow) {
  const [admins, contacts] = await Promise.all([
    supportAdmins(grant.church.id),
    prisma.organizationContact.findMany({
      where: { organizationId: grant.church.id, role: "RESPONSAVEL_CONTA" },
      select: { name: true, email: true },
    }),
  ]);
  const recipients = new Map([...contacts, ...admins].map((recipient) => [recipient.email.toLowerCase(), recipient]));

  await Promise.all(
    [...recipients.values()].map((recipient) =>
      trySendMail(
        supportEmergencyNotice({
          to: recipient.email,
          name: recipient.name,
          churchName: grant.church.name,
          kindLabel: EMERGENCY_KIND_LABELS[grant.emergencyKind ?? "INCIDENTE"],
          approvers: [grant.requestedBy?.name, grant.approvedBy?.name].filter((name): name is string => !!name),
          expiresAt: grant.expiresAt!,
          grant: summary(grant),
        }),
      ),
    ),
  );
}

export function assertNoActiveGrant(active: SupportGrantRow | null) {
  if (active) {
    throw new AppError(
      409,
      "SUPPORT_ALREADY_ACTIVE",
      "O suporte já tem um acesso ativo nesta igreja. Revogue o atual antes de autorizar outro.",
    );
  }
}

export function invalidGrantStatus(message: string) {
  return new AppError(409, "INVALID_SUPPORT_STATUS", message);
}

export const auditGrant = (grant: SupportGrantRow, action: string, before?: SupportGrantRow, description?: string) => ({
  organizationId: grant.church.id,
  module: "ACESSO" as const,
  action,
  targetType: "SupportGrant",
  targetId: grant.id,
  description,
  before: before ? grantSnapshot(before) : undefined,
  after: grantSnapshot(grant),
});

// Configurações › Acesso do suporte (RF-SP01 a RF-SP04, RF-SP08): o admin da igreja autoriza,
// aprova ou recusa pedidos e revoga. Leitura da tela e da faixa.
export class SupportGrantService {
  constructor(private readonly repository: SupportGrantRepository) {}

  // Pedidos aguardando a segunda aprovação interna (emergência) não aparecem para a igreja.
  async list(churchId: string) {
    const grants = (await this.repository.findForChurch(churchId))
      .filter((grant) => grant.status !== "AGUARDANDO_SEGUNDA_APROVACAO")
      .map(mapGrant);

    const active = grants.find((grant) => grant.status === "ATIVO") ?? null;

    return {
      active,
      pending: grants.filter((grant) => grant.status === "PENDENTE"),
      history: grants.filter((grant) => grant !== active && grant.status !== "PENDENTE"),
    };
  }

  async authorize(context: RequestContext, input: AuthorizeGrantInput) {
    const actor = context.actor;
    const grant = await runAudited(actor, async (tx, audit) => {
      assertNoActiveGrant(await this.repository.findActive(context.churchId, tx));

      const now = new Date();
      const grant = await this.repository.create(
        {
          churchId: context.churchId,
          origin: "AUTORIZACAO_ADMIN",
          status: "ATIVO",
          ticket: input.ticket ?? null,
          reason: input.reason,
          scope: input.scope,
          canWrite: input.canWrite,
          writeJustification: input.canWrite ? (input.writeJustification ?? null) : null,
          durationHours: input.durationHours,
          requestedById: actor.userId,
          requestedAt: now,
          approvedById: actor.userId,
          approvedAt: now,
          startsAt: now,
          expiresAt: expiresIn(input.durationHours, now),
        },
        tx,
      );

      await audit(auditGrant(grant, "suporte_autorizar"));
      return grant;
    });

    await notifySupportAuthorized(grant);
    return mapGrant(grant);
  }

  async approve(context: RequestContext, id: string, input: ApproveGrantInput) {
    const grant = await this.decide(context.actor, context.churchId, id, async (tx, current) => {
      if (current.status !== "PENDENTE") throw invalidGrantStatus("Este pedido já foi decidido.");
      assertNoActiveGrant(await this.repository.findActive(context.churchId, tx));

      const now = new Date();
      const durationHours = Math.min(input.durationHours ?? current.durationHours, current.durationHours);

      return {
        action: "suporte_aprovar",
        updated: await this.repository.transition(
          id,
          "PENDENTE",
          {
            status: "ATIVO",
            durationHours,
            approvedById: context.actor.userId,
            approvedAt: now,
            startsAt: now,
            expiresAt: expiresIn(durationHours, now),
          },
          tx,
        ),
      };
    });

    await notifySupportAuthorized(grant);
    return mapGrant(grant);
  }

  async refuse(context: RequestContext, id: string, input: RefuseGrantInput) {
    const grant = await this.decide(context.actor, context.churchId, id, async (tx, current) => {
      if (current.status !== "PENDENTE") throw invalidGrantStatus("Este pedido já foi decidido.");

      return {
        action: "suporte_recusar",
        updated: await this.repository.transition(
          id,
          "PENDENTE",
          { status: "RECUSADO", closedById: context.actor.userId, closedAt: new Date(), closeReason: input.reason ?? null },
          tx,
        ),
      };
    });

    return mapGrant(grant);
  }

  // Revogar encerra na hora: o grant é conferido a cada requisição (RF-SP08). A emergência só o
  // iEzer encerra (incidente, ordem judicial).
  async revoke(context: RequestContext, id: string) {
    const grant = await this.decide(context.actor, context.churchId, id, async (tx, current) => {
      if (grantStatus(current) !== "ATIVO") throw invalidGrantStatus("Este acesso não está ativo.");
      if (current.origin === "EMERGENCIA") {
        throw new AppError(
          403,
          "SUPPORT_EMERGENCY",
          "Acesso de emergência é encerrado pelo iEzer. Fale com o suporte se tiver dúvidas.",
        );
      }

      return {
        action: "suporte_revogar",
        updated: await this.repository.transition(
          id,
          "ATIVO",
          { status: "REVOGADO", closedById: context.actor.userId, closedAt: new Date() },
          tx,
        ),
      };
    });

    return mapGrant(grant);
  }

  // Lê, decide e grava o log na mesma transação; null do transition = outra decisão chegou antes.
  private decide(
    actor: AuditActor,
    churchId: string,
    id: string,
    fn: (tx: Prisma.TransactionClient, current: SupportGrantRow) => Promise<{ action: string; updated: SupportGrantRow | null }>,
  ) {
    return runAudited(actor, async (tx, audit) => {
      const current = await this.repository.findById(id, churchId, tx);
      if (!current || current.status === "AGUARDANDO_SEGUNDA_APROVACAO") throw new SupportGrantNotFoundError();

      const { action, updated } = await fn(tx, current);
      if (!updated) throw invalidGrantStatus("Este acesso mudou enquanto você decidia. Atualize a tela.");

      await audit(auditGrant(updated, action, current));
      return updated;
    });
  }
}

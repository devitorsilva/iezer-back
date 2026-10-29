import type { Prisma, TeamRole } from "@prisma/client";
import { runAudited, type AuditActor } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { hasTeamRole } from "../../../lib/team.js";
import type { SupportGrantRepository, SupportGrantRow } from "../../acesso/suporte/repository.js";
import {
  assertNoActiveGrant,
  auditGrant,
  expiresIn,
  grantStatus,
  invalidGrantStatus,
  mapGrant,
  notifySupportEmergency,
  notifySupportRequest,
  SupportGrantNotFoundError,
} from "../../acesso/suporte/service.js";
import type { CloseGrantInput, EmergencyInput, ListRequestsQuery, RequestGrantInput } from "./schemas.js";

export class RequestChurchNotFoundError extends Error {
  constructor() {
    super("CHURCH_NOT_FOUND");
  }
}

export interface SupportRequestContext {
  actor: AuditActor;
  roles: TeamRole[];
}

// Pedidos de acesso do suporte no back-office (RF-BO34 a RF-BO40, RT-BB11). Leitura vai direto à
// igreja; escrita e emergência passam antes por um Administrador iEzer, que nunca aprova o próprio
// pedido. O prazo só corre depois do sim da igreja (na emergência, do sim interno). Tudo no AuditLog
// da igreja, como "Suporte iEzer".
export class SupportRequestService {
  constructor(private readonly grants: SupportGrantRepository) {}

  // Lista geral ou da igreja (RF-BO37); a situação é calculada (expirado), por isso o filtro é aqui.
  async list(query: ListRequestsQuery) {
    const items = (await this.grants.findAll(query.igreja)).map(mapGrant);
    return query.situacao ? items.filter((item) => item.status === query.situacao) : items;
  }

  async request(context: SupportRequestContext, input: RequestGrantInput) {
    const church = await this.assertChurch(input.churchId);

    // Implantação sem o papel Suporte: só leitura e só com a igreja em Implantação (RF-BO34).
    if (!hasTeamRole(context.roles, "SUPORTE")) {
      if (input.canWrite) {
        throw new AppError(403, "SUPPORT_WRITE_FORBIDDEN", "O papel Implantação só pede acesso somente leitura.");
      }
      if (church.status !== "IMPLANTACAO") {
        throw new AppError(
          403,
          "SUPPORT_IMPLANTACAO_ONLY",
          "O papel Implantação só pede acesso enquanto a igreja está em Implantação.",
        );
      }
    }

    const grant = await runAudited(context.actor, async (tx, audit) => {
      const grant = await this.grants.create(
        {
          churchId: input.churchId,
          origin: "PEDIDO_SUPORTE",
          status: input.canWrite ? "AGUARDANDO_IEZER" : "PENDENTE",
          ticket: input.ticket,
          reason: input.reason,
          scope: input.scope,
          canWrite: input.canWrite,
          writeJustification: input.canWrite ? (input.writeJustification ?? null) : null,
          durationHours: input.durationHours,
          requestedById: context.actor.userId,
        },
        tx,
      );
      await audit(auditGrant(grant, "suporte_pedir"));
      return grant;
    });

    // Com escrita, a igreja só é avisada depois da aprovação interna (RF-BO35).
    const notified = input.canWrite ? 0 : await notifySupportRequest(grant);
    return { ...mapGrant(grant), notified };
  }

  // Emergência (RF-BO39): fica aguardando um Administrador iEzer diferente de quem abriu.
  async requestEmergency(actor: AuditActor, input: EmergencyInput) {
    await this.assertChurch(input.churchId);

    const grant = await runAudited(actor, async (tx, audit) => {
      const grant = await this.grants.create(
        {
          churchId: input.churchId,
          origin: "EMERGENCIA",
          status: "AGUARDANDO_IEZER",
          emergencyKind: input.kind,
          ticket: input.ticket ?? null,
          reason: input.reason,
          scope: input.scope,
          canWrite: input.canWrite,
          writeJustification: input.canWrite ? (input.writeJustification ?? null) : null,
          durationHours: input.durationHours,
          requestedById: actor.userId,
        },
        tx,
      );
      await audit(auditGrant(grant, "suporte_emergencia_pedir"));
      return grant;
    });

    return mapGrant(grant);
  }

  // Aprovação interna (RF-BO35, RF-BO39): a escrita segue para a igreja, com 7 dias para responder a
  // partir daqui; a emergência ativa na hora e avisa a igreja.
  async approve(actor: AuditActor, id: string) {
    const grant = await this.decide(actor, id, async (tx, current) => {
      if (current.status !== "AGUARDANDO_IEZER") throw invalidGrantStatus("Este pedido não está aguardando o iEzer.");
      if (current.requestedBy?.id === actor.userId) {
        throw new AppError(
          403,
          "SUPPORT_SAME_APPROVER",
          "Ninguém aprova o próprio pedido. Outro Administrador iEzer precisa aprovar.",
        );
      }

      const now = new Date();
      const internal = { internalApprovedById: actor.userId, internalApprovedAt: now };

      if (current.origin === "EMERGENCIA") {
        assertNoActiveGrant(await this.grants.findActive(current.church.id, tx));
        return {
          action: "suporte_emergencia_aprovar",
          updated: await this.grants.transition(
            id,
            "AGUARDANDO_IEZER",
            { ...internal, status: "ATIVO", startsAt: now, expiresAt: expiresIn(current.durationHours, now) },
            tx,
          ),
        };
      }

      return {
        action: "suporte_aprovar_iezer",
        updated: await this.grants.transition(id, "AGUARDANDO_IEZER", { ...internal, status: "PENDENTE" }, tx),
      };
    });

    if (grant.origin === "EMERGENCIA") {
      await notifySupportEmergency(grant);
      return mapGrant(grant);
    }

    const notified = await notifySupportRequest(grant);
    return { ...mapGrant(grant), notified };
  }

  async refuse(actor: AuditActor, id: string, input: CloseGrantInput) {
    const grant = await this.decide(actor, id, async (tx, current) => {
      if (current.status !== "AGUARDANDO_IEZER") throw invalidGrantStatus("Este pedido não está aguardando o iEzer.");

      return {
        action: "suporte_recusar_iezer",
        updated: await this.grants.transition(
          id,
          "AGUARDANDO_IEZER",
          { status: "RECUSADO", closedById: actor.userId, closedAt: new Date(), closeReason: input.reason ?? null },
          tx,
        ),
      };
    });

    return mapGrant(grant);
  }

  // Desistir de um pedido ainda sem resposta, no iEzer ou na igreja (inclusive o expirado).
  async cancel(actor: AuditActor, id: string, input: CloseGrantInput) {
    const grant = await this.decide(actor, id, async (tx, current) => {
      if (current.status !== "PENDENTE" && current.status !== "AGUARDANDO_IEZER") {
        throw invalidGrantStatus("Só pedidos ainda sem resposta podem ser cancelados.");
      }

      return {
        action: "suporte_cancelar",
        updated: await this.grants.transition(
          id,
          current.status,
          { status: "CANCELADO", closedById: actor.userId, closedAt: new Date(), closeReason: input.reason ?? null },
          tx,
        ),
      };
    });

    return mapGrant(grant);
  }

  // Encerrar antes do prazo (RF-BO40), e o único jeito de encerrar uma emergência.
  async end(actor: AuditActor, id: string, input: CloseGrantInput) {
    const grant = await this.decide(actor, id, async (tx, current) => {
      if (grantStatus(current) !== "ATIVO") throw invalidGrantStatus("Este acesso não está ativo.");

      return {
        action: "suporte_encerrar",
        updated: await this.grants.transition(
          id,
          "ATIVO",
          { status: "ENCERRADO", closedById: actor.userId, closedAt: new Date(), closeReason: input.reason ?? null },
          tx,
        ),
      };
    });

    return mapGrant(grant);
  }

  // Igreja suspensa ou encerrada não recebe pedido: ninguém entra nela (RF-BO20).
  private async assertChurch(churchId: string) {
    const church = await prisma.organization.findFirst({
      where: { id: churchId, type: "SEDE", isActive: true },
      select: { id: true, status: true },
    });
    if (!church) throw new RequestChurchNotFoundError();
    if (church.status === "SUSPENSA" || church.status === "ENCERRADA") {
      throw new AppError(409, "CHURCH_SUSPENDED", "A igreja está suspensa ou encerrada. Ninguém acessa os dados dela.");
    }
    return church;
  }

  // Lê, decide e grava o log na mesma transação; null do transition = outra decisão chegou antes.
  private decide(
    actor: AuditActor,
    id: string,
    fn: (tx: Prisma.TransactionClient, current: SupportGrantRow) => Promise<{ action: string; updated: SupportGrantRow | null }>,
  ) {
    return runAudited(actor, async (tx, audit) => {
      const current = await this.grants.findById(id, null, tx);
      if (!current) throw new SupportGrantNotFoundError();

      const { action, updated } = await fn(tx, current);
      if (!updated) throw invalidGrantStatus("Este pedido mudou enquanto você decidia. Atualize a tela.");

      await audit(auditGrant(updated, action, current));
      return updated;
    });
  }
}

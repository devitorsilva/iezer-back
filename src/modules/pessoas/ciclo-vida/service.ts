import type { ChurchListType, PersonEventType, PersonStatus, Prisma } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditWriter } from "../../../lib/audit.js";
import { formatCivilDate } from "../../../lib/civil-date.js";
import { AppError } from "../../../lib/errors.js";
import { normalizeSearchText } from "../../../lib/text.js";
import { notifySuspension, suspendPersonAccess, type SuspendedUser } from "../../acesso/suspensao.js";
import type { ChurchListRepository } from "../listas/repository.js";
import type { PersonDetail, PersonRepository } from "../pessoas/repository.js";
import { describeMissing, missingFields, type MissingField } from "../pessoas/rules.js";
import { auditEntry, isUniqueViolation, mapDetail, PersonNotFoundError, requirementInput } from "../pessoas/service.js";
import type { FollowUpRow, LifecycleRepository, PersonEventRow } from "./repository.js";
import type {
  FollowUpPayload,
  PromotePayload,
  StatusPayload,
  StatusWithReasonPayload,
  TransferPayload,
} from "./schemas.js";

type Db = Prisma.TransactionClient;

// Como a situação aparece na tela (vai no aviso de suspensão).
const STATUS_LABELS: Record<PersonStatus, string> = {
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  TRANSFERIDO: "Transferido",
  DESLIGADO: "Desligado do rol",
  FALECIDO: "Falecido",
};

// "SUSPENDED": a ação suspendeu o acesso agora (RF-US04). "STILL_SUSPENDED": a pessoa foi
// reativada, mas o acesso continua suspenso até o admin reativar.
type AccessChange = "SUSPENDED" | "STILL_SUSPENDED" | null;

function mapEvent(event: PersonEventRow) {
  return {
    kind: "EVENTO" as const,
    id: event.id,
    type: event.type,
    date: formatCivilDate(event.date),
    organizationId: event.organizationId,
    fromBond: event.fromBond,
    toBond: event.toBond,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reasonName: event.reason?.name ?? null,
    note: event.note,
    details: event.details,
    authorName: event.author.name,
    createdAt: event.createdAt.toISOString(),
  };
}

function mapFollowUp(followUp: FollowUpRow) {
  return {
    kind: "ACOMPANHAMENTO" as const,
    id: followUp.id,
    type: followUp.type,
    date: formatCivilDate(followUp.date),
    organizationId: followUp.organizationId,
    note: followUp.note,
    authorName: followUp.author.name,
    createdAt: followUp.createdAt.toISOString(),
  };
}

function authorId(context: RequestContext) {
  if (!context.actor.userId) throw new AppError(403, "PERMISSION_DENIED", "Ação exige um usuário.");
  return context.actor.userId;
}

function invalidStatus(status: PersonStatus) {
  return new AppError(
    409,
    "INVALID_STATUS",
    `A situação da pessoa é "${STATUS_LABELS[status]}"; esta ação não se aplica.`,
    { status },
  );
}

function promotionError(missing: MissingField[]) {
  const guardianRelated = missing.some((field) => field === "guardian" || field === "consent");
  return new AppError(
    400,
    guardianRelated ? "GUARDIAN_REQUIRED" : "BOND_REQUIREMENTS",
    guardianRelated
      ? `Para este vínculo, vincule antes um responsável na aba Família. Falta: ${describeMissing(missing)}.`
      : `Falta preencher: ${describeMissing(missing)}.`,
    { missingFields: missing },
  );
}

interface StatusChange {
  type: PersonEventType;
  // Ação no AuditLog.
  action: string;
  allowedFrom: PersonStatus[];
  toStatus: PersonStatus;
  date: Date;
  note?: string | null;
  reason?: { id: string; listType: ChurchListType };
  details?: Prisma.InputJsonValue;
  // Saída de Ativo suspende o acesso (RT-AB13).
  suspends: boolean;
}

// Ciclo de vida (RF-V01 a RF-V04, RT-B02) e acompanhamento (RF-V06): cada ação grava um evento
// na linha do tempo com autor, na mesma transação da mudança.
export class LifecycleService {
  constructor(
    private readonly repository: LifecycleRepository,
    private readonly people: PersonRepository,
    private readonly lists: ChurchListRepository,
  ) {}

  async timeline(context: RequestContext, id: string) {
    const person = await this.people.findById(id, context.readOrganizationIds);
    if (!person) throw new PersonNotFoundError();

    const [events, followUps] = await Promise.all([
      this.repository.listEvents(id),
      this.repository.listFollowUps(id),
    ]);
    const items = [...events.map(mapEvent), ...followUps.map(mapFollowUp)].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    return { items };
  }

  // Promover vínculo (RF-V03): pode pular estágios ou voltar um (correção). Pede só o que falta
  // para o vínculo novo, com a regra do "não piorar" da edição.
  async promote(context: RequestContext, id: string, payload: PromotePayload) {
    const { bond, date, note, ...fields } = payload;

    return runAudited(context.actor, async (tx, audit) => {
      const existing = await this.loadPerson(context, id, tx);
      if (existing.status !== "ATIVO") {
        throw new AppError(409, "PERSON_NOT_ACTIVE", "Reative a pessoa antes de mudar o vínculo.");
      }
      if (bond === existing.bond) throw new AppError(400, "SAME_BOND", "A pessoa já está neste vínculo.");

      const changes = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ) as Partial<typeof fields>;
      if (changes.admissionMethodId) await this.assertListItem(context, changes.admissionMethodId, "FORMA_ADMISSAO", tx);

      const current = requirementInput(existing);
      const before = new Set(missingFields(current));
      const name = changes.name ?? existing.name;
      const worse = missingFields({ ...current, ...changes, name, bond }).filter((field) => !before.has(field));
      if (worse.length > 0) throw promotionError(worse);

      const updated = await this.people.update(
        id,
        {
          ...changes,
          bond,
          bondSince: date,
          ...(changes.name ? { searchName: normalizeSearchText(`${name} ${existing.preferredName ?? ""}`) } : {}),
        },
        tx,
      );
      const event = await this.repository.createEvent(
        {
          organizationId: existing.organizationId,
          personId: id,
          type: "PROMOCAO",
          date,
          fromBond: existing.bond,
          toBond: bond,
          note,
          authorUserId: authorId(context),
        },
        tx,
      );

      const person = mapDetail(updated);
      await audit(
        auditEntry("promover_vinculo", existing.organizationId, "Person", id, {
          before: mapDetail(existing),
          after: person,
        }),
      );
      return { person, event: mapEvent(event), accessChange: null as AccessChange };
    });
  }

  inactivate(context: RequestContext, id: string, payload: StatusWithReasonPayload) {
    return this.changeStatus(context, id, {
      type: "INATIVACAO",
      action: "inativar",
      allowedFrom: ["ATIVO"],
      toStatus: "INATIVO",
      date: payload.date,
      note: payload.note,
      reason: { id: payload.reasonId, listType: "MOTIVO_INATIVACAO" },
      suspends: true,
    });
  }

  dismiss(context: RequestContext, id: string, payload: StatusWithReasonPayload) {
    return this.changeStatus(context, id, {
      type: "DESLIGAMENTO",
      action: "desligar",
      allowedFrom: ["ATIVO", "INATIVO"],
      toStatus: "DESLIGADO",
      date: payload.date,
      note: payload.note,
      reason: { id: payload.reasonId, listType: "MOTIVO_DESLIGAMENTO" },
      suspends: true,
    });
  }

  registerDeath(context: RequestContext, id: string, payload: StatusPayload) {
    return this.changeStatus(context, id, {
      type: "FALECIMENTO",
      action: "registrar_falecimento",
      allowedFrom: ["ATIVO", "INATIVO", "TRANSFERIDO", "DESLIGADO"],
      toStatus: "FALECIDO",
      date: payload.date,
      note: payload.note,
      suspends: true,
    });
  }

  // Reativar volta para Ativo; o acesso suspenso não volta sozinho (RF-US04).
  reactivate(context: RequestContext, id: string, payload: StatusPayload) {
    return this.changeStatus(context, id, {
      type: "REATIVACAO",
      action: "reativar",
      allowedFrom: ["INATIVO", "TRANSFERIDO", "DESLIGADO", "FALECIDO"],
      toStatus: "ATIVO",
      date: payload.date,
      note: payload.note,
      suspends: false,
    });
  }

  // Transferir (RF-V04). Para outra igreja: situação Transferido e acesso suspenso. Para uma
  // congregação do iEzer: muda a congregação, mantém situação, histórico e acesso.
  // `transferOrganizationIds`: onde o usuário tem "Alterar situação" (o destino precisa estar entre elas).
  async transfer(context: RequestContext, id: string, payload: TransferPayload, transferOrganizationIds: string[]) {
    if (payload.kind === "EXTERNA") {
      return this.changeStatus(context, id, {
        type: "TRANSFERENCIA",
        action: "transferir",
        allowedFrom: ["ATIVO", "INATIVO"],
        toStatus: "TRANSFERIDO",
        date: payload.date,
        note: payload.note,
        details: { churchName: payload.churchName, letterIssued: payload.letterIssued },
        suspends: true,
      });
    }

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.loadPerson(context, id, tx);
        if (!["ATIVO", "INATIVO"].includes(existing.status)) throw invalidStatus(existing.status);
        if (payload.organizationId === existing.organizationId) {
          throw new AppError(400, "SAME_ORGANIZATION", "A pessoa já é desta congregação.");
        }

        const destination = transferOrganizationIds.includes(payload.organizationId)
          ? await this.repository.findChurchOrganization(payload.organizationId, context.churchId, tx)
          : null;
        if (!destination) {
          throw new AppError(400, "INVALID_REFERENCE", "Congregação de destino não encontrada ou fora do seu acesso.");
        }

        const updated = await this.people.update(id, { organizationId: destination.id }, tx);
        const event = await this.repository.createEvent(
          {
            organizationId: existing.organizationId,
            personId: id,
            type: "TRANSFERENCIA_INTERNA",
            date: payload.date,
            note: payload.note,
            details: {
              fromOrganizationId: existing.organizationId,
              fromOrganizationName: existing.organization.name,
              toOrganizationId: destination.id,
              toOrganizationName: destination.name,
            },
            authorUserId: authorId(context),
          },
          tx,
        );

        const person = mapDetail(updated);
        await audit(
          auditEntry("transferir", existing.organizationId, "Person", id, { before: mapDetail(existing), after: person }),
        );
        return { person, event: mapEvent(event), accessChange: null as AccessChange };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "CPF_CONFLICT", "Já existe pessoa com este CPF na congregação de destino.");
      }
      throw error;
    }
  }

  async registerFollowUp(context: RequestContext, id: string, payload: FollowUpPayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const person = await this.loadPerson(context, id, tx);
      const followUp = await this.repository.createFollowUp(
        {
          organizationId: person.organizationId,
          personId: id,
          date: payload.date,
          type: payload.type,
          note: payload.note,
          authorUserId: authorId(context),
        },
        tx,
      );

      const dto = mapFollowUp(followUp);
      await audit({
        ...auditEntry("registrar_acompanhamento", person.organizationId, "FollowUp", followUp.id, { after: dto }),
        personIds: [id],
      });
      return dto;
    });
  }

  private async changeStatus(context: RequestContext, id: string, change: StatusChange) {
    let suspended: SuspendedUser | null = null;

    const result = await runAudited(context.actor, async (tx, audit) => {
      const existing = await this.loadPerson(context, id, tx);
      if (!change.allowedFrom.includes(existing.status)) throw invalidStatus(existing.status);
      if (change.reason) await this.assertListItem(context, change.reason.id, change.reason.listType, tx);

      const updated = await this.people.update(id, { status: change.toStatus }, tx);
      const event = await this.repository.createEvent(
        {
          organizationId: existing.organizationId,
          personId: id,
          type: change.type,
          date: change.date,
          fromStatus: existing.status,
          toStatus: change.toStatus,
          reasonId: change.reason?.id,
          note: change.note,
          details: change.details,
          authorUserId: authorId(context),
        },
        tx,
      );

      const person = mapDetail(updated);
      await audit(
        auditEntry(change.action, existing.organizationId, "Person", id, {
          before: mapDetail(existing),
          after: person,
        }),
      );

      suspended = change.suspends ? await this.suspend(tx, existing, change.toStatus, audit) : null;
      const accessChange: AccessChange = suspended
        ? "SUSPENDED"
        : change.toStatus === "ATIVO" && (await this.repository.hasSuspendedUser(id, tx))
          ? "STILL_SUSPENDED"
          : null;

      return { person, event: mapEvent(event), accessChange };
    });

    if (suspended) {
      // O aviso não desfaz a suspensão já gravada.
      await notifySuspension(context.churchId, suspended).catch((error) =>
        console.error("[suspensão] falha ao avisar os admins:", error),
      );
    }
    return result;
  }

  private suspend(db: Db, person: PersonDetail, toStatus: PersonStatus, audit: AuditWriter) {
    return suspendPersonAccess(db, person.id, person.organizationId, STATUS_LABELS[toStatus], audit);
  }

  private async loadPerson(context: RequestContext, id: string, db: Db) {
    const person = await this.people.findById(id, context.readOrganizationIds, db);
    if (!person) throw new PersonNotFoundError();
    return person;
  }

  private async assertListItem(context: RequestContext, id: string, type: ChurchListType, db: Db) {
    const item = await this.lists.findActiveItem(id, context.churchId, type, db);
    if (!item) throw new AppError(400, "INVALID_REFERENCE", "Item não encontrado nas listas da igreja.");
  }
}

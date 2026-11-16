import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { AgendaReservationRepository, type ReservationCreateData, type ReservationRow } from "./repository.js";
import type { ReservationPayload, ReservationQuery } from "./schemas.js";

const mapReservation = (row: ReservationRow) => ({
  ...row,
  startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
  effectiveStartsAt: row.effectiveStartsAt.toISOString(), effectiveEndsAt: row.effectiveEndsAt.toISOString(),
  releasedAt: row.releasedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export function resolveReservationGroupId(row: Pick<ReservationRow, "id" | "groupId">) {
  return row.groupId ?? row.id;
}

export function partitionReservationGroup<TExisting extends { spaceId: string }, TDesired extends { spaceId: string }>(
  existing: TExisting[],
  desired: TDesired[],
) {
  const bySpace = new Map(existing.map((row) => [row.spaceId, row]));
  const retained: Array<{ existing: TExisting; desired: TDesired }> = [];
  const added: TDesired[] = [];
  for (const row of desired) {
    const current = bySpace.get(row.spaceId);
    if (current) {
      retained.push({ existing: current, desired: row });
      bySpace.delete(row.spaceId);
    } else {
      added.push(row);
    }
  }
  return { retained, added, removed: [...bySpace.values()] };
}

export function isReservationConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2004") return false;
  return JSON.stringify(error.meta ?? {}).includes("AgendaReservation_no_active_overlap");
}

function conflict(): AppError {
  return new AppError(409, "AGENDA_RESERVATION_CONFLICT", "Um ou mais espaços já estão reservados neste período.");
}

function entry(action: string, organizationId: string, id: string, snapshots: object): AuditEntry {
  return { organizationId, module: "AGENDA", action, targetType: "AgendaReservation", targetId: id, ...snapshots };
}

export function calculateEffectiveInterval(
  startsAt: Date,
  endsAt: Date,
  preparationMinutes: number,
  cleanupMinutes: number,
) {
  return {
    effectiveStartsAt: new Date(startsAt.getTime() - preparationMinutes * 60_000),
    effectiveEndsAt: new Date(endsAt.getTime() + cleanupMinutes * 60_000),
  };
}

export class AgendaReservationService {
  constructor(private readonly repository: AgendaReservationRepository) {}

  async list(context: RequestContext, query: ReservationQuery) {
    return (await this.repository.findAll(context.readOrganizationIds, query)).map(mapReservation);
  }

  async getById(context: RequestContext, id: string) {
    const row = await this.repository.findById(id, context.readOrganizationIds);
    if (!row) throw new AppError(404, "AGENDA_RESERVATION_NOT_FOUND", "Reserva não encontrada.");
    return mapReservation(row);
  }

  async create(context: RequestContext, payload: ReservationPayload) {
    const organizationId = requireWriteOrganization(context);
    const userId = this.requireUser(context);
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const data = await this.buildRows(organizationId, userId, randomUUID(), payload, tx);
        const rows = await this.repository.createMany(data, tx);
        const mapped = rows.map(mapReservation);
        await audit(mapped.map((row) => entry("criar", organizationId, row.id, { after: row })));
        return { items: mapped };
      });
    } catch (error) {
      if (isReservationConstraintError(error)) throw conflict();
      throw error;
    }
  }

  async update(context: RequestContext, id: string, payload: ReservationPayload) {
    const organizationId = requireWriteOrganization(context);
    const userId = this.requireUser(context);
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.requireReservation(context, id, tx);
        if (existing.status !== "ATIVA") throw new AppError(409, "AGENDA_RESERVATION_NOT_ACTIVE", "Somente reservas ativas podem ser alteradas.");
        const groupId = resolveReservationGroupId(existing);
        const existingGroup = existing.groupId
          ? await this.repository.findGroup(groupId, context.readOrganizationIds, tx)
          : [existing];
        if (existingGroup.some((row) => row.status !== "ATIVA")) {
          throw new AppError(409, "AGENDA_RESERVATION_NOT_ACTIVE", "Somente reservas ativas podem ser alteradas.");
        }
        const desired = await this.buildRows(organizationId, userId, groupId, payload, tx, groupId);
        const changes = partitionReservationGroup(existingGroup, desired);
        const updated: ReservationRow[] = [];
        for (const { existing: current, desired: row } of changes.retained) {
          updated.push(await this.repository.update(current.id, {
            spaceId: row.spaceId, title: row.title, startsAt: row.startsAt, endsAt: row.endsAt,
            effectiveStartsAt: row.effectiveStartsAt, effectiveEndsAt: row.effectiveEndsAt,
          }, tx));
        }
        if (changes.removed.length) await this.repository.cancelRows(changes.removed.map((row) => row.id), tx);
        const created = changes.added.length ? await this.repository.createMany(changes.added, tx) : [];
        const result = [...updated, ...created].map(mapReservation);
        await audit([
          ...existingGroup.map((row) => entry("editar", organizationId, row.id, { before: mapReservation(row), after: result.find((item) => item.spaceId === row.spaceId) ?? null })),
          ...created.map((row) => entry("criar", organizationId, row.id, { after: mapReservation(row) })),
        ]);
        return { items: result };
      });
    } catch (error) {
      if (isReservationConstraintError(error)) throw conflict();
      throw error;
    }
  }

  async cancel(context: RequestContext, id: string) {
    requireWriteOrganization(context);
    return runAudited(context.actor, async (tx, audit) => {
      const existing = await this.requireReservation(context, id, tx);
      if (existing.status !== "ATIVA") throw new AppError(409, "AGENDA_RESERVATION_NOT_ACTIVE", "A reserva já foi liberada ou cancelada.");
      const groupId = resolveReservationGroupId(existing);
      const group = existing.groupId
        ? await this.repository.findGroup(groupId, context.readOrganizationIds, tx)
        : [existing];
      const active = group.filter((row) => row.status === "ATIVA");
      if (!active.length) throw new AppError(409, "AGENDA_RESERVATION_NOT_ACTIVE", "A reserva já foi liberada ou cancelada.");
      await this.repository.cancelGroup(groupId, tx);
      const canceledAt = new Date().toISOString();
      const items = active.map((row) => ({ ...mapReservation(row), status: "CANCELADA" as const, releasedAt: canceledAt }));
      await audit(active.map((row, index) => entry("cancelar", row.organizationId, row.id, { before: mapReservation(row), after: items[index] })));
      return { ...items[0], groupId, items };
    });
  }

  private requireUser(context: RequestContext) {
    if (!context.actor.userId) throw new AppError(403, "AGENDA_USER_REQUIRED", "Esta operação exige um usuário autenticado.");
    return context.actor.userId;
  }

  private async requireReservation(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const row = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!row) throw new AppError(404, "AGENDA_RESERVATION_NOT_FOUND", "Reserva não encontrada.");
    return row;
  }

  private async buildRows(organizationId: string, userId: string, groupId: string, payload: ReservationPayload, tx: Prisma.TransactionClient, excludeGroupId?: string): Promise<ReservationCreateData[]> {
    const spaces = await this.repository.findSpaces(payload.spaceIds, organizationId, tx);
    if (spaces.length !== payload.spaceIds.length) {
      throw new AppError(400, "AGENDA_INVALID_SPACES", "Selecione apenas espaços ativos desta organização.", { field: "spaceIds" });
    }
    const rows = spaces.map((space) => ({
      groupId, organizationId, createdById: userId, spaceId: space.id, title: payload.title,
      startsAt: payload.startsAt, endsAt: payload.endsAt,
      ...calculateEffectiveInterval(payload.startsAt, payload.endsAt, space.preparationMinutes, space.cleanupMinutes),
    }));
    for (const row of rows) {
      if ((await this.repository.findConflicts([row.spaceId], row.effectiveStartsAt, row.effectiveEndsAt, excludeGroupId, tx)).length) throw conflict();
    }
    return rows;
  }
}

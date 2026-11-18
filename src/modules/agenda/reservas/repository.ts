import { AgendaReservationStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { ReservationQuery } from "./schemas.js";

type Db = Prisma.TransactionClient;

const include = { space: true } satisfies Prisma.AgendaReservationInclude;
export type ReservationRow = Prisma.AgendaReservationGetPayload<{ include: typeof include }>;

export interface ReservationCreateData {
  groupId: string;
  organizationId: string;
  spaceId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  effectiveStartsAt: Date;
  effectiveEndsAt: Date;
  createdById: string;
}

export class AgendaReservationRepository {
  findAll(organizationIds: string[], query: ReservationQuery, db: Db = prisma): Promise<ReservationRow[]> {
    return db.agendaReservation.findMany({
      where: {
        organizationId: { in: organizationIds },
        kind: "AVULSA",
        ...(query.spaceId ? { spaceId: query.spaceId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from ? { endsAt: { gt: query.from } } : {}),
        ...(query.to ? { startsAt: { lt: query.to } } : {}),
      },
      include,
      orderBy: [{ startsAt: "asc" }, { space: { name: "asc" } }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<ReservationRow | null> {
    return db.agendaReservation.findFirst({ where: { id, organizationId: { in: organizationIds }, kind: "AVULSA" }, include });
  }

  findGroup(groupId: string, organizationIds: string[], db: Db = prisma): Promise<ReservationRow[]> {
    return db.agendaReservation.findMany({
      where: { groupId, organizationId: { in: organizationIds }, kind: "AVULSA", status: "ATIVA" },
      include,
      orderBy: { space: { name: "asc" } },
    });
  }

  findSpaces(ids: string[], organizationId: string, db: Db) {
    return db.agendaSpace.findMany({ where: { id: { in: ids }, organizationId, isActive: true }, orderBy: { name: "asc" } });
  }

  findConflicts(spaceIds: string[], startsAt: Date, endsAt: Date, excludeGroupId: string | undefined, db: Db) {
    return db.agendaReservation.findMany({
      where: {
        spaceId: { in: spaceIds },
        status: "ATIVA",
        ...(excludeGroupId ? { OR: [{ groupId: null }, { groupId: { not: excludeGroupId } }] } : {}),
        effectiveStartsAt: { lt: endsAt },
        effectiveEndsAt: { gt: startsAt },
      },
      select: { id: true, spaceId: true, startsAt: true, endsAt: true },
    });
  }

  createMany(data: ReservationCreateData[], db: Db) {
    return Promise.all(data.map((item) => db.agendaReservation.create({ data: { ...item, kind: "AVULSA" }, include })));
  }

  update(id: string, data: Omit<ReservationCreateData, "organizationId" | "createdById" | "groupId">, db: Db) {
    return db.agendaReservation.update({ where: { id }, data, include });
  }

  cancelGroup(groupId: string, db: Db) {
    return db.agendaReservation.updateMany({
      where: { groupId, kind: "AVULSA", status: AgendaReservationStatus.ATIVA },
      data: { status: AgendaReservationStatus.CANCELADA, releasedAt: new Date() },
    });
  }

  cancelRows(ids: string[], db: Db) {
    return db.agendaReservation.updateMany({
      where: { id: { in: ids }, status: AgendaReservationStatus.ATIVA },
      data: { status: AgendaReservationStatus.CANCELADA, releasedAt: new Date() },
    });
  }
}

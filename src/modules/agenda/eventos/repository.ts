import { Prisma, type AgendaEventStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

export type AgendaDb = Prisma.TransactionClient;
export const eventDetailInclude = {
  organization: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  leaders: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
  participants: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
  reminders: true,
  occurrences: {
    orderBy: { startsAt: "asc" as const },
    include: {
      reservations: { include: { space: { select: { id: true, name: true } } } },
      responses: { include: { person: { select: { id: true, name: true, preferredName: true } } } },
      scale: { include: { person: { select: { id: true, name: true, preferredName: true, user: { select: { id: true } } } } } },
      attendances: { include: { person: { select: { id: true, name: true, preferredName: true } } } },
    },
  },
} satisfies Prisma.AgendaEventSeriesInclude;

export type EventDetail = Prisma.AgendaEventSeriesGetPayload<{ include: typeof eventDetailInclude }>;

export class EventRepository {
  list(organizationIds: string[], from: Date, to: Date, includeDrafts = false) {
    return prisma.agendaOccurrence.findMany({
      where: { series: { organizationId: { in: organizationIds }, ...(includeDrafts ? {} : { status: { not: "RASCUNHO" } }) }, startsAt: { lt: to }, endsAt: { gt: from }, status: { not: "CANCELADA" } },
      orderBy: { startsAt: "asc" },
      select: { id: true, seriesId: true, startsAt: true, endsAt: true, status: true, titleOverride: true, colorOverride: true, externalLocationName: true, reservations: { where: { status: "ATIVA" }, select: { space: { select: { name: true } } } }, series: { select: { title: true, color: true, allDay: true, locationType: true, externalLocationName: true, organization: { select: { id: true, name: true } } } } },
    });
  }

  findDetail(id: string, organizationIds: string[], db: AgendaDb | typeof prisma = prisma) {
    return db.agendaEventSeries.findFirst({ where: { id, organizationId: { in: organizationIds } }, include: eventDetailInclude });
  }

  setStatus(id: string, status: AgendaEventStatus, db: AgendaDb) {
    return db.agendaEventSeries.update({ where: { id }, data: { status, ...(status === "PUBLICADO" ? { publishedAt: new Date() } : {}), ...(status === "CANCELADO" ? { cancelledAt: new Date() } : {}) } });
  }
}

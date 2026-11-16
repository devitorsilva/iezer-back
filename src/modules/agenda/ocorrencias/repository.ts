import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

export type OccurrenceDb = Prisma.TransactionClient;
export const occurrenceInclude = {
  series: {
    include: {
      organization: { select: { name: true } },
      leaders: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
      participants: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
    },
  },
  responses: true,
  scale: true,
  attendances: true,
} satisfies Prisma.AgendaOccurrenceInclude;

export type OccurrenceDetail = Prisma.AgendaOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;

export class OccurrenceRepository {
  find(id: string, organizationIds: string[], db: OccurrenceDb | typeof prisma = prisma) {
    return db.agendaOccurrence.findFirst({ where: { id, series: { organizationId: { in: organizationIds } } }, include: occurrenceInclude });
  }
}

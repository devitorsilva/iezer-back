import type { AgendaOutbox, AgendaOutboxStatus, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { AGENDA_NOTIFICATION_TOPIC } from "./types.js";

const CLAIM_LIMIT = 25;
const LEASE_MS = 5 * 60 * 1000;

export class AgendaNotificationOutboxRepository {
  async claimDue(now = new Date(), limit = CLAIM_LIMIT): Promise<AgendaOutbox[]> {
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

    return prisma.$transaction(async (tx) => tx.$queryRaw<AgendaOutbox[]>`
      WITH candidates AS (
        SELECT id
        FROM "AgendaOutbox"
        WHERE topic = ${AGENDA_NOTIFICATION_TOPIC}
          AND (
            (status = 'PENDENTE' AND "availableAt" <= ${now})
            OR (status = 'PROCESSANDO' AND "availableAt" <= ${now})
          )
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE "AgendaOutbox" AS outbox
      SET status = 'PROCESSANDO',
          attempts = outbox.attempts + 1,
          "availableAt" = ${leaseUntil},
          "updatedAt" = ${now}
      FROM candidates
      WHERE outbox.id = candidates.id
      RETURNING outbox.*
    `, { maxWait: 30_000, timeout: 30_000 });
  }

  async createInAppNotification(outbox: AgendaOutbox, input: {
    userId: string;
    occurrenceId?: string | null;
    title: string;
    body: string;
    linkUrl: string;
  }) {
    await prisma.agendaNotification.upsert({
      where: { id: notificationIdForOutbox(outbox.id) },
      create: {
        id: notificationIdForOutbox(outbox.id),
        organizationId: outbox.organizationId,
        userId: input.userId,
        occurrenceId: input.occurrenceId,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
      },
      update: {},
    });
  }

  markProcessed(id: string, processedAt: Date) {
    return prisma.agendaOutbox.updateMany({
      where: { id, status: "PROCESSANDO" },
      data: { status: "PROCESSADO", processedAt, lastError: null },
    });
  }

  markFailed(id: string, status: AgendaOutboxStatus, availableAt: Date, error: string) {
    return prisma.agendaOutbox.updateMany({
      where: { id, status: "PROCESSANDO" },
      data: { status, availableAt, lastError: error.slice(0, 2_000) },
    });
  }
}

export function notificationIdForOutbox(outboxId: string) {
  // O próprio CUID da outbox torna a criação repetível e continua válido como cursor da API.
  return outboxId;
}

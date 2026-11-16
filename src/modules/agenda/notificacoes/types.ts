import type { Prisma } from "@prisma/client";

export const AGENDA_NOTIFICATION_TOPIC = "agenda.notification";

export interface AgendaInAppNotificationPayload {
  userId: string;
  occurrenceId?: string | null;
  title: string;
  body: string;
  linkUrl: string;
}

export interface AgendaEmailNotificationPayload {
  to: string;
  subject: string;
  text: string;
  churchName?: string | null;
}

export interface AgendaNotificationOutboxPayload {
  inApp?: AgendaInAppNotificationPayload;
  email?: AgendaEmailNotificationPayload;
}

export interface EnqueueAgendaNotificationInput {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: AgendaNotificationOutboxPayload;
  availableAt?: Date;
}

export type AgendaTransactionClient = Prisma.TransactionClient;

export function isAgendaNotificationPayload(value: Prisma.JsonValue): value is Prisma.JsonObject & AgendaNotificationOutboxPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return payload.inApp !== undefined || payload.email !== undefined;
}

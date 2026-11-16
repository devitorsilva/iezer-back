import type { Prisma } from "@prisma/client";
import { AGENDA_NOTIFICATION_TOPIC, type AgendaTransactionClient, type EnqueueAgendaNotificationInput } from "./types.js";

export async function enqueueAgendaNotification(
  tx: AgendaTransactionClient,
  input: EnqueueAgendaNotificationInput,
) {
  if (!input.payload.inApp && !input.payload.email) {
    throw new Error("A notificação da Agenda precisa de ao menos um canal.");
  }

  return tx.agendaOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      organizationId: input.organizationId,
      topic: AGENDA_NOTIFICATION_TOPIC,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload as Prisma.InputJsonValue,
      availableAt: input.availableAt,
    },
    update: {},
  });
}

export async function enqueueAgendaNotifications(
  tx: AgendaTransactionClient,
  inputs: readonly EnqueueAgendaNotificationInput[],
) {
  return Promise.all(inputs.map((input) => enqueueAgendaNotification(tx, input)));
}

import type { AgendaTransactionClient, EnqueueAgendaNotificationInput } from "./types.js";

export interface AgendaRecipient {
  personId: string;
  name: string;
  email: string | null;
  userId: string | null;
}

interface PersonLike {
  id: string;
  name: string;
  preferredName?: string | null;
  email?: string | null;
  user?: { id: string; status: string } | null;
}

export function uniqueAgendaRecipients(people: readonly PersonLike[]): AgendaRecipient[] {
  const recipients = new Map<string, AgendaRecipient>();
  for (const person of people) {
    recipients.set(person.id, {
      personId: person.id,
      name: person.preferredName ?? person.name,
      email: person.email ?? null,
      userId: person.user?.status === "ATIVO" ? person.user.id : null,
    });
  }
  return [...recipients.values()];
}

export function agendaRecipientNotification(input: {
  recipient: AgendaRecipient;
  organizationId: string;
  churchName: string;
  seriesId: string;
  occurrenceId?: string | null;
  eventTitle: string;
  kind: string;
  body: string;
  emailSubject?: string;
  availableAt?: Date;
}): EnqueueAgendaNotificationInput | null {
  const { recipient } = input;
  const payload = {
    inApp: recipient.userId ? {
      userId: recipient.userId,
      occurrenceId: input.occurrenceId,
      title: input.eventTitle,
      body: input.body,
      linkUrl: `/app/agenda/eventos/${input.seriesId}`,
    } : undefined,
    email: recipient.email ? {
      to: recipient.email,
      subject: input.emailSubject ?? `Evento: ${input.eventTitle}`,
      text: input.body,
      churchName: input.churchName,
    } : undefined,
  };
  if (!payload.inApp && !payload.email) return null;
  return {
    organizationId: input.organizationId,
    aggregateType: "AgendaEventSeries",
    aggregateId: input.seriesId,
    idempotencyKey: `agenda:${input.kind}:${input.seriesId}:${input.occurrenceId ?? "series"}:${recipient.personId}`,
    payload,
    availableAt: input.availableAt,
  };
}

export async function loadOccurrenceRecipients(
  tx: AgendaTransactionClient,
  occurrenceId: string,
) {
  const occurrence = await tx.agendaOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      series: {
        include: {
          organization: { select: { name: true } },
          leaders: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
          participants: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
        },
      },
      scale: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
    },
  });
  if (!occurrence) return null;
  const people = [
    ...occurrence.series.leaders.map((item) => item.person),
    ...occurrence.series.participants.map((item) => item.person),
    ...occurrence.scale.map((item) => item.person),
  ];
  return { occurrence, recipients: uniqueAgendaRecipients(people) };
}

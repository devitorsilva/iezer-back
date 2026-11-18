import { prisma } from "../../../lib/prisma.js";
import { enqueueAgendaNotifications } from "./outbox.js";
import { agendaRecipientNotification, uniqueAgendaRecipients } from "./recipients.js";

const REMINDER_LOOKAHEAD_DAYS = 366;

export function agendaReminderTriggerAt(startsAt: Date, minutesBefore: number) {
  return new Date(startsAt.getTime() - minutesBefore * 60_000);
}

export function isAgendaReminderDue(startsAt: Date, minutesBefore: number, now: Date) {
  return startsAt > now && agendaReminderTriggerAt(startsAt, minutesBefore) <= now;
}

export async function enqueueDueAgendaReminders(now = new Date()) {
  const horizon = new Date(now.getTime() + REMINDER_LOOKAHEAD_DAYS * 86_400_000);
  return prisma.$transaction(async (tx) => {
    const reminders = await tx.agendaReminder.findMany({
      where: {
        series: {
          status: "PUBLICADO",
          occurrences: { some: { status: "AGENDADA", startsAt: { gt: now, lte: horizon } } },
        },
      },
      include: {
        series: {
          include: {
            organization: { select: { name: true } },
            leaders: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
            participants: { include: { person: { include: { user: { select: { id: true, status: true } } } } } },
            occurrences: {
              where: { status: "AGENDADA", startsAt: { gt: now, lte: horizon } },
              include: { scale: { include: { person: { include: { user: { select: { id: true, status: true } } } } } } },
            },
          },
        },
      },
    });
    const notifications = reminders.flatMap((reminder) => reminder.series.occurrences.flatMap((occurrence) => {
      if (!isAgendaReminderDue(occurrence.startsAt, reminder.minutesBefore, now)) return [];
      const people = [
        ...reminder.series.leaders.map((item) => item.person),
        ...reminder.series.participants.map((item) => item.person),
        ...occurrence.scale.map((item) => item.person),
      ];
      return uniqueAgendaRecipients(people).flatMap((recipient) => {
        const notification = agendaRecipientNotification({
          recipient,
          organizationId: reminder.series.organizationId,
          churchName: reminder.series.organization.name,
          seriesId: reminder.seriesId,
          occurrenceId: occurrence.id,
          eventTitle: reminder.series.title,
          kind: `reminder:${reminder.id}`,
          body: `Lembrete: ${reminder.series.title} começa em breve.`,
          emailSubject: `Lembrete: ${reminder.series.title}`,
        });
        if (!notification) return [];
        if (!reminder.inApp && notification.payload.inApp) delete notification.payload.inApp;
        if (!reminder.email && notification.payload.email) delete notification.payload.email;
        return notification.payload.inApp || notification.payload.email ? [notification] : [];
      });
    }));
    await enqueueAgendaNotifications(tx, notifications);
    return notifications.length;
  });
}

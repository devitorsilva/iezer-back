import assert from "node:assert/strict";
import test from "node:test";
import type { AgendaOutbox } from "@prisma/client";
import { agendaNotificationEmail } from "../../src/modules/agenda/notificacoes/email-template.js";
import type { AgendaNotificationOutboxRepository } from "../../src/modules/agenda/notificacoes/repository.js";
import {
  AGENDA_OUTBOX_MAX_ATTEMPTS,
  agendaOutboxNextStatus,
  agendaOutboxRetryDelayMs,
} from "../../src/modules/agenda/notificacoes/retry.js";
import { AgendaNotificationOutboxWorker } from "../../src/modules/agenda/notificacoes/worker.js";
import { agendaReminderTriggerAt, isAgendaReminderDue } from "../../src/modules/agenda/notificacoes/reminders.js";
import { agendaRecipientNotification, uniqueAgendaRecipients } from "../../src/modules/agenda/notificacoes/recipients.js";
import type { MyAgendaNotificationRepository } from "../../src/modules/me/notificacoes/repository.js";
import { InvalidNotificationSelectionError, MyAgendaNotificationService } from "../../src/modules/me/notificacoes/service.js";

function outbox(payload: AgendaOutbox["payload"], attempts = 1): AgendaOutbox {
  const now = new Date("2026-11-16T12:00:00.000Z");
  return {
    id: "cmagendaoutbox0000000000001",
    organizationId: "cmorganization000000000001",
    topic: "agenda.notification",
    aggregateType: "AgendaOccurrence",
    aggregateId: "cmoccurrence00000000000001",
    payload,
    idempotencyKey: "event-published:user-1",
    status: "PROCESSANDO",
    attempts,
    availableAt: now,
    processedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

test("retry da outbox cresce exponencialmente e possui limite", () => {
  assert.equal(agendaOutboxRetryDelayMs(1), 15_000);
  assert.equal(agendaOutboxRetryDelayMs(2), 30_000);
  assert.equal(agendaOutboxRetryDelayMs(20), 3_600_000);
  assert.equal(agendaOutboxNextStatus(AGENDA_OUTBOX_MAX_ATTEMPTS - 1), "PENDENTE");
  assert.equal(agendaOutboxNextStatus(AGENDA_OUTBOX_MAX_ATTEMPTS), "FALHOU");
});

test("lembrete vence no instante configurado e ignora ocorrência iniciada", () => {
  const startsAt = new Date("2026-11-17T12:00:00.000Z");
  assert.equal(agendaReminderTriggerAt(startsAt, 1440).toISOString(), "2026-11-16T12:00:00.000Z");
  assert.equal(isAgendaReminderDue(startsAt, 1440, new Date("2026-11-16T12:00:00.000Z")), true);
  assert.equal(isAgendaReminderDue(startsAt, 60, new Date("2026-11-16T12:00:00.000Z")), false);
  assert.equal(isAgendaReminderDue(startsAt, 1440, startsAt), false);
});

test("destinatários da Agenda são deduplicados e preservam canais disponíveis", () => {
  const recipients = uniqueAgendaRecipients([
    { id: "person-1", name: "Ana", email: "ana@example.com", user: { id: "user-1", status: "ATIVO" } },
    { id: "person-1", name: "Ana", email: "ana@example.com", user: { id: "user-1", status: "ATIVO" } },
    { id: "person-2", name: "Bruno", email: null, user: null },
  ]);
  assert.equal(recipients.length, 2);
  const notification = agendaRecipientNotification({
    recipient: recipients[0], organizationId: "org-1", churchName: "Igreja",
    seriesId: "series-1", occurrenceId: "occurrence-1", eventTitle: "Culto",
    kind: "reminder:reminder-1", body: "Começa em breve.",
  });
  assert.equal(notification?.idempotencyKey, "agenda:reminder:reminder-1:series-1:occurrence-1:person-1");
  assert.equal(notification?.payload.inApp?.userId, "user-1");
  assert.equal(notification?.payload.email?.to, "ana@example.com");
  assert.equal(agendaRecipientNotification({
    recipient: recipients[1], organizationId: "org-1", churchName: "Igreja",
    seriesId: "series-1", eventTitle: "Culto", kind: "published", body: "Publicado.",
  }), null);
});

test("template de e-mail da Agenda inclui destinatário, conteúdo e link", () => {
  const message = agendaNotificationEmail({
    to: "membro@example.com",
    recipientName: "Ana",
    churchName: "Igreja Central",
    title: "Ensaio atualizado",
    body: "O horário do ensaio mudou.",
    linkUrl: "https://iezer.app/app/agenda/eventos/1",
  });

  assert.equal(message.to, "membro@example.com");
  assert.equal(message.churchName, "Igreja Central");
  assert.match(message.text, /Olá, Ana\./);
  assert.match(message.text, /https:\/\/iezer\.app\/app\/agenda\/eventos\/1/);
});

test("worker cria notificação in-app e conclui a outbox", async () => {
  const calls: string[] = [];
  const row = outbox({
    inApp: {
      userId: "cmuser0000000000000000001",
      title: "Novo evento",
      body: "Você foi convidado.",
      linkUrl: "/app/agenda/eventos/1",
    },
  });
  const repository = {
    claimDue: async () => [row],
    createInAppNotification: async () => { calls.push("create"); },
    markProcessed: async () => { calls.push("processed"); return { count: 1 }; },
    markFailed: async () => { calls.push("failed"); return { count: 1 }; },
  } as unknown as AgendaNotificationOutboxRepository;

  const count = await new AgendaNotificationOutboxWorker(repository).processDue(new Date("2026-11-16T12:00:00Z"));

  assert.equal(count, 1);
  assert.deepEqual(calls, ["create", "processed"]);
});

test("worker agenda retry quando o payload é inválido", async () => {
  let failure: { status: string; availableAt: Date; error: string } | undefined;
  const now = new Date("2026-11-16T12:00:00Z");
  const repository = {
    claimDue: async () => [outbox({ invalid: true })],
    createInAppNotification: async () => undefined,
    markProcessed: async () => ({ count: 0 }),
    markFailed: async (_id: string, status: string, availableAt: Date, error: string) => {
      failure = { status, availableAt, error };
      return { count: 1 };
    },
  } as unknown as AgendaNotificationOutboxRepository;

  await new AgendaNotificationOutboxWorker(repository).processDue(now);

  assert.equal(failure?.status, "PENDENTE");
  assert.equal(failure?.availableAt.toISOString(), "2026-11-16T12:00:15.000Z");
  assert.match(failure?.error ?? "", /inválido/);
});

test("central pagina itens e preserva contador total de não lidas", async () => {
  const rows = [1, 2, 3].map((index) => ({
    id: `cmnotification00000000000${index}`,
    organizationId: "cmorganization000000000001",
    occurrenceId: null,
    title: `Notificação ${index}`,
    body: "Corpo",
    linkUrl: "/app/agenda",
    readAt: null,
    createdAt: new Date(`2026-11-16T12:0${index}:00Z`),
  }));
  const repository = {
    list: async () => rows,
    unreadCount: async () => 7,
    updateReadState: async () => ({ count: 0 }),
  } as unknown as MyAgendaNotificationRepository;

  const result = await new MyAgendaNotificationService(repository).list({
    userId: "cmuser0000000000000000001",
    organizationIds: ["cmorganization000000000001"],
    limit: 2,
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.unreadCount, 7);
  assert.equal(result.nextCursor, rows[1].id);
  assert.equal(result.items[0].createdAt, "2026-11-16T12:01:00.000Z");
});

test("central exige seleção explícita para alteração parcial", async () => {
  const repository = {
    list: async () => [],
    unreadCount: async () => 0,
    updateReadState: async () => ({ count: 0 }),
  } as unknown as MyAgendaNotificationRepository;

  await assert.rejects(
    () => new MyAgendaNotificationService(repository).changeReadState({
      userId: "cmuser0000000000000000001",
      organizationIds: ["cmorganization000000000001"],
      read: true,
    }),
    InvalidNotificationSelectionError,
  );
});

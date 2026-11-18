import type { AgendaOutbox } from "@prisma/client";
import { trySendMail } from "../../../lib/mailer.js";
import { AgendaNotificationOutboxRepository } from "./repository.js";
import { agendaOutboxNextStatus, agendaOutboxRetryDelayMs } from "./retry.js";
import { isAgendaNotificationPayload } from "./types.js";
import { enqueueDueAgendaReminders } from "./reminders.js";

const DISPATCH_INTERVAL_MS = 30_000;
let running = false;

export class AgendaNotificationOutboxWorker {
  constructor(private readonly repository = new AgendaNotificationOutboxRepository()) {}

  async processDue(now = new Date()) {
    const rows = await this.repository.claimDue(now);
    for (const row of rows) await this.processOne(row, now);
    return rows.length;
  }

  private async processOne(row: AgendaOutbox, now: Date) {
    try {
      if (!isAgendaNotificationPayload(row.payload)) throw new Error("Payload de notificação da Agenda inválido.");

      if (row.payload.inApp) await this.repository.createInAppNotification(row, row.payload.inApp);

      if (row.payload.email) {
        const sent = await trySendMail(row.payload.email);
        if (!sent) throw new Error("O provedor de e-mail não confirmou o envio.");
      }

      await this.repository.markProcessed(row.id, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = agendaOutboxNextStatus(row.attempts);
      const retryAt = status === "PENDENTE"
        ? new Date(now.getTime() + agendaOutboxRetryDelayMs(row.attempts))
        : now;
      await this.repository.markFailed(row.id, status, retryAt, message);
    }
  }
}

const worker = new AgendaNotificationOutboxWorker();

export async function dispatchAgendaNotifications() {
  if (running) return 0;
  running = true;
  try {
    await enqueueDueAgendaReminders();
    return await worker.processDue();
  } catch (error) {
    console.error("[agenda:notificacoes] falha no processamento da outbox:", error);
    return 0;
  } finally {
    running = false;
  }
}

export function startAgendaNotificationDispatcher() {
  const timer = setInterval(() => void dispatchAgendaNotifications(), DISPATCH_INTERVAL_MS);
  timer.unref();
  return timer;
}

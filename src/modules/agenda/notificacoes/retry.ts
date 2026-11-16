export const AGENDA_OUTBOX_MAX_ATTEMPTS = 8;

export function agendaOutboxRetryDelayMs(attempt: number) {
  const normalizedAttempt = Math.max(1, Math.trunc(attempt));
  return Math.min(60 * 60 * 1000, 15_000 * 2 ** (normalizedAttempt - 1));
}

export function agendaOutboxNextStatus(attempt: number) {
  return attempt >= AGENDA_OUTBOX_MAX_ATTEMPTS ? "FALHOU" as const : "PENDENTE" as const;
}

import type { AgendaEmailNotificationPayload } from "./types.js";

export function agendaNotificationEmail(input: {
  to: string;
  recipientName?: string | null;
  churchName?: string | null;
  title: string;
  body: string;
  linkUrl: string;
}): AgendaEmailNotificationPayload {
  const greeting = input.recipientName?.trim() ? `Olá, ${input.recipientName.trim()}.` : "Olá.";

  return {
    to: input.to,
    churchName: input.churchName,
    subject: input.title,
    text: `${greeting}\n\n${input.body}\n\nAcesse o evento: ${input.linkUrl}\n\nEquipe iEzer`,
  };
}

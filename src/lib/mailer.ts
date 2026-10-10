import { env } from "../config/env.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  // Nome da igreja: o remetente aparece como "Nome da Igreja via iEzer" (RT-AB12).
  churchName?: string | null;
}

function senderName(churchName?: string | null) {
  // Aspas e quebras de linha quebrariam o cabeçalho From.
  const name = churchName?.replace(/["\r\n<>]/g, "").trim();
  return name ? `${name} via iEzer` : "iEzer";
}

// Envio de e-mail transacional pelo Resend (https://resend.com/docs/api-reference/emails/send-email).
// Sem RESEND_API_KEY, o e-mail vai para o log: em dev com o conteúdo (links de convite e senha),
// em produção só destinatário e assunto, para não deixar tokens no log.
export async function sendMail(message: MailMessage): Promise<boolean> {
  const from = `${senderName(message.churchName)} <${env.EMAIL_FROM}>`;

  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      console.warn(`[e-mail não enviado: sem RESEND_API_KEY] para=${message.to} assunto="${message.subject}"`);
    } else {
      console.info(
        `\n[e-mail] de: ${from}\npara: ${message.to}\nassunto: ${message.subject}\n\n${message.text}\n[/e-mail]\n`,
      );
    }
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
  });

  if (!response.ok) {
    console.error(`[e-mail] falha no envio para ${message.to}: ${response.status} ${await response.text()}`);
    return false;
  }

  return true;
}

// Envio que nunca derruba a operação: o convite continua válido e tem "Copiar link".
export async function trySendMail(message: MailMessage) {
  try {
    return await sendMail(message);
  } catch (error) {
    console.error(`[e-mail] erro ao enviar para ${message.to}:`, error);
    return false;
  }
}

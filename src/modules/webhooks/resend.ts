import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailEventType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

// Webhook do Resend (RT-BB08, https://resend.com/docs/webhooks). Assinado pelo Svix: HMAC-SHA256 de
// "svix-id.svix-timestamp.corpo" com o segredo (whsec_ + base64), em "v1,<assinatura>" separados
// por espaço. Só funciona de verdade com o domínio verificado no Resend.

const TIMESTAMP_TOLERANCE_S = 5 * 60;

export interface WebhookSignature {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

export function verifyResendSignature(secret: string, headers: WebhookSignature, body: string, now = Date.now()) {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Evento antigo ou do futuro: proteção contra reenvio de uma requisição capturada.
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TIMESTAMP_TOLERANCE_S) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// Só os eventos que viram alerta no painel; os outros (enviado, entregue, aberto...) são ignorados.
const EVENT_TYPES: Record<string, EmailEventType> = {
  "email.bounced": "REJEITADO",
  "email.complained": "RECLAMACAO",
};

export const resendEventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().optional(),
    to: z.array(z.string()).default([]),
  }),
});

export type ResendEvent = z.infer<typeof resendEventSchema>;

const insensitive = (email: string) => ({ equals: email, mode: "insensitive" as const });

// Igreja (sede) do e-mail: usuário com atribuição, convite, contato da conta. Nula para a equipe
// ou para quem não é de igreja.
export async function churchIdForEmail(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: insensitive(email), assignments: { some: {} } },
    select: { assignments: { take: 1, select: { organization: { select: { id: true, parentId: true } } } } },
  });
  const organization = user?.assignments[0]?.organization;
  if (organization) return organization.parentId ?? organization.id;

  const invite = await prisma.invite.findFirst({
    where: { email: insensitive(email) },
    orderBy: { createdAt: "desc" },
    select: { churchId: true },
  });
  if (invite) return invite.churchId;

  const contact = await prisma.organizationContact.findFirst({
    where: { email: insensitive(email) },
    select: { organizationId: true },
  });
  return contact?.organizationId ?? null;
}

// Grava o evento uma vez só (o Resend reenvia o mesmo svix-id quando a resposta falha). Os e-mails
// do iEzer têm um destinatário só; o primeiro basta. Devolve false quando o evento é ignorado.
export async function recordResendEvent(webhookId: string, event: ResendEvent) {
  const type = EVENT_TYPES[event.type];
  const email = event.data.to[0]?.trim().toLowerCase();
  if (!type || !email) return false;

  const occurredAt = event.created_at ? new Date(event.created_at) : new Date();

  await prisma.emailEvent.createMany({
    data: [
      {
        type,
        email,
        organizationId: await churchIdForEmail(email),
        resendEmailId: event.data.email_id ?? null,
        webhookId,
        occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      },
    ],
    skipDuplicates: true,
  });
  return true;
}

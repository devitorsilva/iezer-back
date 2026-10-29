import { FastifyPluginAsync } from "fastify";
import { env } from "../../config/env.js";
import { rateLimitByIp } from "../../lib/rate-limit.js";
import { recordResendEvent, resendEventSchema, verifyResendSignature } from "./resend.js";

const header = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Webhooks públicos de serviços externos, conferidos pela assinatura.
export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // A assinatura é sobre o corpo exato: nada de parse antes da conferência.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  // POST /api/webhooks/resend (RT-BB08): e-mails rejeitados e marcados como spam.
  app.post("/resend", { preHandler: rateLimitByIp("webhook-resend", 300, 60_000) }, async (request, reply) => {
    if (!env.RESEND_WEBHOOK_SECRET) {
      return reply.code(503).send({
        statusCode: 503,
        code: "WEBHOOK_UNAVAILABLE",
        message: "Webhook do Resend não configurado.",
      });
    }

    const body = typeof request.body === "string" ? request.body : "";
    const signature = {
      id: header(request.headers["svix-id"]),
      timestamp: header(request.headers["svix-timestamp"]),
      signature: header(request.headers["svix-signature"]),
    };
    if (!verifyResendSignature(env.RESEND_WEBHOOK_SECRET, signature, body)) {
      return reply.code(401).send({ statusCode: 401, code: "INVALID_SIGNATURE", message: "Assinatura inválida." });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return reply.badRequest("Corpo inválido.");
    }
    const event = resendEventSchema.safeParse(payload);
    if (!event.success) return reply.badRequest("Evento inválido.");

    const recorded = await recordResendEvent(signature.id!, event.data);
    if (recorded) request.log.info({ type: event.data.type }, "evento de e-mail do Resend gravado");
    return { received: true };
  });
};

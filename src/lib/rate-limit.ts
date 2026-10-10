import type { FastifyReply, FastifyRequest } from "fastify";

// Limite de taxa em memória (RT-AB09). Uma instância no Render, como o rate limit do Better Auth.
const hits = new Map<string, number[]>();

// Registra uma tentativa e diz se passou do limite na janela.
export function isRateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 10_000) {
    for (const [entry, times] of hits) {
      if (times.every((time) => now - time >= windowMs)) hits.delete(entry);
    }
  }

  return recent.length > max;
}

export const RATE_LIMITED_MESSAGE = "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";

// preHandler por IP para rotas públicas.
export function rateLimitByIp(name: string, max: number, windowMs: number) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isRateLimited(`${name}:${request.ip}`, max, windowMs)) return;

    return reply.code(429).send({ statusCode: 429, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE });
  };
}

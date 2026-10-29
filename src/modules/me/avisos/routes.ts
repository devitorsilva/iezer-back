import { FastifyPluginAsync, type FastifyReply } from "fastify";
import { z } from "zod";
import {
  dismissAnnouncement,
  listMyAnnouncements,
  markAnnouncementSeen,
  MyAnnouncementNotFoundError,
} from "./service.js";

const paramsSchema = z.object({ id: z.string().cuid() });

async function handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof MyAnnouncementNotFoundError) return reply.notFound("Aviso não encontrado.");
    throw error;
  }
}

// Avisos da equipe iEzer no app das igrejas (RF-BO47, RT-BB10), em /api/me/avisos. Conta da
// equipe, mesmo em modo suporte, não vê a faixa.
export const myAnnouncementRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => ({ items: request.team ? [] : await listMyAnnouncements(request.user.id) }));

  app.post("/:id/visto", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    if (request.team) return reply.notFound("Aviso não encontrado.");
    return handleNotFound(reply, () => markAnnouncementSeen(request.user.id, id));
  });

  app.post("/:id/dispensar", async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    if (request.team) return reply.notFound("Aviso não encontrado.");
    return handleNotFound(reply, () => dismissAnnouncement(request.user.id, id));
  });
};

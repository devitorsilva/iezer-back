import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { InvalidNotificationSelectionError, MyAgendaNotificationService } from "./service.js";

const querySchema = z.object({
  unreadOnly: z.stringbool().optional().default(false),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().cuid().optional(),
});

const changeReadStateSchema = z.object({
  ids: z.array(z.string().cuid()).max(100).optional(),
  all: z.boolean().optional().default(false),
  read: z.boolean().optional().default(true),
}).refine((value) => value.all || Boolean(value.ids?.length), {
  message: "Informe as notificações ou selecione todas.",
  path: ["ids"],
});

export const myAgendaNotificationRoutes: FastifyPluginAsync = async (app) => {
  const service = new MyAgendaNotificationService();

  app.get("/", async (request) => {
    const query = querySchema.parse(request.query);
    return service.list({
      userId: request.user.id,
      organizationIds: request.access.readOrganizationIds,
      ...query,
    });
  });

  app.patch("/", async (request, reply) => {
    const payload = changeReadStateSchema.parse(request.body);
    try {
      return await service.changeReadState({
        userId: request.user.id,
        organizationIds: request.access.readOrganizationIds,
        ...payload,
      });
    } catch (error) {
      if (error instanceof InvalidNotificationSelectionError) {
        return reply.badRequest("Informe as notificações que deseja atualizar.");
      }
      throw error;
    }
  });
};

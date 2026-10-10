import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { InviteController } from "./controller.js";
import { InviteRepository } from "./repository.js";
import { InviteService } from "./service.js";

export const inviteRepository = new InviteRepository();
export const inviteService = new InviteService(inviteRepository);
const controller = new InviteController(inviteService);

// Convites da igreja (RF-CV01 a RF-CV04, RF-RS04). O aceite público está em src/modules/convites.
export const inviteRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("acesso.usuarios.ver", "acesso.usuarios.gerenciar") };
  const gerenciar = { preHandler: requirePermission("acesso.usuarios.gerenciar") };

  app.get("/convites", ver, controller.list);
  app.post("/convites", gerenciar, controller.create);
  app.post("/convites/:id/reenviar", gerenciar, controller.resend);
  app.post("/convites/:id/cancelar", gerenciar, controller.cancel);
  app.patch("/convites/:id/email", gerenciar, controller.changeEmail);
};

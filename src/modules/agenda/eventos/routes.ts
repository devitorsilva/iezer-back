import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { EventController } from "./controller.js";

const controller = new EventController();

export const agendaEventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/eventos", controller.list);
  app.get("/eventos/:id", controller.get);
  app.post("/eventos", { preHandler: requirePermission("agenda.criar") }, controller.create);
  app.patch("/eventos/:id", controller.update);
  app.post("/eventos/:id/publicar", controller.publish);
  app.post("/eventos/:id/cancelar", controller.cancel);
  app.post("/eventos/:id/concluir", controller.complete);
  app.delete("/eventos/:id", controller.remove);
};

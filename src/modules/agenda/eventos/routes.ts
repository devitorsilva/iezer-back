import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { EventController } from "./controller.js";

const controller = new EventController();

export const agendaEventRoutes: FastifyPluginAsync = async (app) => {
  const view = { preHandler: requirePermission("agenda.ver") };
  app.get("/eventos", view, controller.list);
  app.get("/eventos/:id", view, controller.get);
  app.post("/eventos", { preHandler: requirePermission("agenda.criar") }, controller.create);
  // Delegated leaders are authorized by the service, so detail mutations only require module access here.
  app.patch("/eventos/:id", view, controller.update);
  app.post("/eventos/:id/publicar", view, controller.publish);
  app.post("/eventos/:id/cancelar", view, controller.cancel);
  app.delete("/eventos/:id", view, controller.remove);
};

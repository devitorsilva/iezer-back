import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { OccurrenceController } from "./controller.js";

const controller = new OccurrenceController();
export const agendaOccurrenceRoutes: FastifyPluginAsync = async (app) => {
  const view = { preHandler: requirePermission("agenda.ver") };
  app.patch("/ocorrencias/:id", view, controller.update);
  app.patch("/ocorrencias/:id/resposta", view, controller.respond);
  app.put("/ocorrencias/:id/escala", view, controller.scale);
  app.put("/ocorrencias/:id/presencas", view, controller.attendance);
};

import type { FastifyPluginAsync } from "fastify";
import { OccurrenceController } from "./controller.js";

const controller = new OccurrenceController();
export const agendaOccurrenceRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/ocorrencias/:id", controller.update);
  app.patch("/ocorrencias/:id/resposta", controller.respond);
  app.put("/ocorrencias/:id/escala", controller.scale);
  app.put("/ocorrencias/:id/presencas", controller.attendance);
};

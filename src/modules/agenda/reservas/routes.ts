import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { AgendaReservationController } from "./controller.js";
import { AgendaReservationRepository } from "./repository.js";
import { AgendaReservationService } from "./service.js";

const controller = new AgendaReservationController(new AgendaReservationService(new AgendaReservationRepository()));

export const agendaReservationRoutes: FastifyPluginAsync = async (app) => {
  const view = { preHandler: requirePermission("agenda.ver", "agenda.reservas.gerenciar") };
  const manage = { preHandler: requirePermission("agenda.reservas.gerenciar") };
  app.get("/reservas", view, controller.list);
  app.get("/reservas/:id", view, controller.getById);
  app.post("/reservas", manage, controller.create);
  app.put("/reservas/:id", manage, controller.update);
  app.post("/reservas/:id/cancelar", manage, controller.cancel);
};

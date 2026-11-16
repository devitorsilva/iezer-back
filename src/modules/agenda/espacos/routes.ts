import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { AgendaSpaceController } from "./controller.js";
import { AgendaSpaceRepository } from "./repository.js";
import { AgendaSpaceService } from "./service.js";

const controller = new AgendaSpaceController(new AgendaSpaceService(new AgendaSpaceRepository()));

export const agendaSpaceRoutes: FastifyPluginAsync = async (app) => {
  const view = { preHandler: requirePermission("agenda.ver", "agenda.espacos.gerenciar", "agenda.reservas.gerenciar") };
  const manage = { preHandler: requirePermission("agenda.espacos.gerenciar") };
  app.get("/espacos", view, controller.list);
  app.get("/espacos/:id", view, controller.getById);
  app.post("/espacos", manage, controller.create);
  app.put("/espacos/:id", manage, controller.update);
  app.delete("/espacos/:id", manage, controller.remove);
};

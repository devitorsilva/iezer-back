import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { ReceivableController } from "./controller.js";
import { ReceivableRepository } from "./repository.js";
import { ReceivableService } from "./service.js";

const repository = new ReceivableRepository();
const service = new ReceivableService(repository);
const controller = new ReceivableController(service);

export const receivableRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("financeiro.receber.ver") };
  const editar = { preHandler: requirePermission("financeiro.receber.editar") };
  const excluir = { preHandler: requirePermission("financeiro.excluir") };

  app.get("/contas-a-receber", ver, controller.list);
  app.post("/contas-a-receber", editar, controller.create);
  app.put("/contas-a-receber/:id", editar, controller.update);
  app.patch("/contas-a-receber/:id/baixar", editar, controller.settle);
  app.delete("/contas-a-receber/:id", excluir, controller.remove);
};

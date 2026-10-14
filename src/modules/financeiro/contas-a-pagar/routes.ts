import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { PayableController } from "./controller.js";
import { PayableRepository } from "./repository.js";
import { PayableService } from "./service.js";

const repository = new PayableRepository();
const service = new PayableService(repository);
const controller = new PayableController(service);

export const payableRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("financeiro.pagar.ver") };
  const editar = { preHandler: requirePermission("financeiro.pagar.editar") };
  const excluir = { preHandler: requirePermission("financeiro.excluir") };

  app.get("/contas-a-pagar", ver, controller.list);
  app.post("/contas-a-pagar", editar, controller.create);
  app.put("/contas-a-pagar/:id", editar, controller.update);
  app.patch("/contas-a-pagar/:id/baixar", editar, controller.settle);
  app.delete("/contas-a-pagar/:id", excluir, controller.remove);
};

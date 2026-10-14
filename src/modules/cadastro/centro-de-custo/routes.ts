import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { CostCenterController } from "./controller.js";
import { CostCenterRepository } from "./repository.js";
import { CostCenterService } from "./service.js";

const repository = new CostCenterRepository();
const service = new CostCenterService(repository);
const controller = new CostCenterController(service);

export const costCenterRoutes: FastifyPluginAsync = async (app) => {
  // Lookups dos lançamentos: quem vê pagar ou receber também lê os cadastros.
  const ver = {
    preHandler: requirePermission("financeiro.pagar.ver", "financeiro.receber.ver", "financeiro.cadastros.editar"),
  };
  const editar = { preHandler: requirePermission("financeiro.cadastros.editar") };

  app.get("/centro-de-custo", ver, controller.list);
  app.get("/centro-de-custo/:id", ver, controller.getById);
  app.post("/centro-de-custo", editar, controller.create);
  app.put("/centro-de-custo/:id", editar, controller.update);
  app.delete("/centro-de-custo/:id", editar, controller.remove);
};

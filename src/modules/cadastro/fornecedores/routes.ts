import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { SupplierController } from "./controller.js";
import { SupplierRepository } from "./repository.js";
import { SupplierService } from "./service.js";

const repository = new SupplierRepository();
const service = new SupplierService(repository);
const controller = new SupplierController(service);

export const supplierRoutes: FastifyPluginAsync = async (app) => {
  // Lookups dos lançamentos: quem vê pagar ou receber também lê os cadastros.
  const ver = {
    preHandler: requirePermission("financeiro.pagar.ver", "financeiro.receber.ver", "financeiro.cadastros.editar"),
  };
  const editar = { preHandler: requirePermission("financeiro.cadastros.editar") };

  app.get("/fornecedores", ver, controller.list);
  app.get("/fornecedores/:id", ver, controller.getById);
  app.post("/fornecedores", editar, controller.create);
  app.put("/fornecedores/:id", editar, controller.update);
  app.delete("/fornecedores/:id", editar, controller.remove);
};

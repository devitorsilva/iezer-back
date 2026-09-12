import { FastifyPluginAsync } from "fastify";
import { SupplierController } from "./controller.js";
import { SupplierRepository } from "./repository.js";
import { SupplierService } from "./service.js";

const repository = new SupplierRepository();
const service = new SupplierService(repository);
const controller = new SupplierController(service);

export const supplierRoutes: FastifyPluginAsync = async (app) => {
  app.get("/fornecedores", controller.list);
  app.get("/fornecedores/:id", controller.getById);
  app.post("/fornecedores", controller.create);
  app.put("/fornecedores/:id", controller.update);
  app.delete("/fornecedores/:id", controller.remove);
};

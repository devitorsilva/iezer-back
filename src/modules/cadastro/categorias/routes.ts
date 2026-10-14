import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { CategoryController } from "./controller.js";
import { CategoryRepository } from "./repository.js";
import { CategoryService } from "./service.js";

const repository = new CategoryRepository();
const service = new CategoryService(repository);
const controller = new CategoryController(service);

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  // Lookups dos lançamentos: quem vê pagar ou receber também lê os cadastros.
  const ver = {
    preHandler: requirePermission("financeiro.pagar.ver", "financeiro.receber.ver", "financeiro.cadastros.editar"),
  };
  const editar = { preHandler: requirePermission("financeiro.cadastros.editar") };

  app.get("/categorias", ver, controller.list);
  app.get("/categorias/:id", ver, controller.getById);
  app.post("/categorias", editar, controller.create);
  app.put("/categorias/:id", editar, controller.update);
  app.delete("/categorias/:id", editar, controller.remove);
};

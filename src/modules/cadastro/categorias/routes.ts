import { FastifyPluginAsync } from "fastify";
import { CategoryController } from "./controller.js";
import { CategoryRepository } from "./repository.js";
import { CategoryService } from "./service.js";

const repository = new CategoryRepository();
const service = new CategoryService(repository);
const controller = new CategoryController(service);

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/categorias", controller.list);
  app.get("/categorias/:id", controller.getById);
  app.post("/categorias", controller.create);
  app.put("/categorias/:id", controller.update);
  app.delete("/categorias/:id", controller.remove);
};

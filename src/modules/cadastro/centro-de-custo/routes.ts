import { FastifyPluginAsync } from "fastify";
import { CostCenterController } from "./controller.js";
import { CostCenterRepository } from "./repository.js";
import { CostCenterService } from "./service.js";

const repository = new CostCenterRepository();
const service = new CostCenterService(repository);
const controller = new CostCenterController(service);

export const costCenterRoutes: FastifyPluginAsync = async (app) => {
  app.get("/centro-de-custo", controller.list);
  app.get("/centro-de-custo/:id", controller.getById);
  app.post("/centro-de-custo", controller.create);
  app.put("/centro-de-custo/:id", controller.update);
  app.delete("/centro-de-custo/:id", controller.remove);
};

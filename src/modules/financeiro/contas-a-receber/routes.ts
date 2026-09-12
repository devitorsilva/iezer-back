import { FastifyPluginAsync } from "fastify";
import { ReceivableController } from "./controller.js";
import { ReceivableRepository } from "./repository.js";
import { ReceivableService } from "./service.js";

const repository = new ReceivableRepository();
const service = new ReceivableService(repository);
const controller = new ReceivableController(service);

export const receivableRoutes: FastifyPluginAsync = async (app) => {
  app.get("/contas-a-receber", controller.list);
  app.post("/contas-a-receber", controller.create);
  app.put("/contas-a-receber/:id", controller.update);
  app.patch("/contas-a-receber/:id/baixar", controller.settle);
  app.delete("/contas-a-receber/:id", controller.remove);
};

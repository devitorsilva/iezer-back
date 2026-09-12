import { FastifyPluginAsync } from "fastify";
import { PayableController } from "./controller.js";
import { PayableRepository } from "./repository.js";
import { PayableService } from "./service.js";

const repository = new PayableRepository();
const service = new PayableService(repository);
const controller = new PayableController(service);

export const payableRoutes: FastifyPluginAsync = async (app) => {
  app.get("/contas-a-pagar", controller.list);
  app.post("/contas-a-pagar", controller.create);
  app.put("/contas-a-pagar/:id", controller.update);
  app.patch("/contas-a-pagar/:id/baixar", controller.settle);
  app.delete("/contas-a-pagar/:id", controller.remove);
};

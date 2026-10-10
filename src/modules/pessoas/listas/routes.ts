import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { ChurchListController } from "./controller.js";
import { ChurchListRepository } from "./repository.js";
import { ChurchListService } from "./service.js";

export const churchListRepository = new ChurchListRepository();
const service = new ChurchListService(churchListRepository);
const controller = new ChurchListController(service);

export const churchListRoutes: FastifyPluginAsync = async (app) => {
  app.get("/listas", { preHandler: requirePermission("pessoas.ver") }, controller.list);
};

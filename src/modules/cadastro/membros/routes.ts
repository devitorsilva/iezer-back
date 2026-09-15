import { FastifyPluginAsync } from "fastify";
import { MemberController } from "./controller.js";
import { MemberRepository } from "./repository.js";
import { MemberService } from "./service.js";

const repository = new MemberRepository();
const service = new MemberService(repository);
const controller = new MemberController(service);

export const memberRoutes: FastifyPluginAsync = async (app) => {
  app.get("/membros", controller.list);
  app.get("/membros/:id", controller.getById);
  app.post("/membros", controller.create);
  app.put("/membros/:id", controller.update);
  app.delete("/membros/:id", controller.remove);
};

import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { MemberController } from "./controller.js";
import { MemberRepository } from "./repository.js";
import { MemberService } from "./service.js";

const repository = new MemberRepository();
const service = new MemberService(repository);
const controller = new MemberController(service);

export const memberRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("pessoas.ver") };

  app.get("/membros", ver, controller.list);
  app.get("/membros/:id", ver, controller.getById);
  app.post("/membros", { preHandler: requirePermission("pessoas.criar") }, controller.create);
  app.put("/membros/:id", { preHandler: requirePermission("pessoas.editar") }, controller.update);
  app.delete("/membros/:id", { preHandler: requirePermission("pessoas.apagar_registro") }, controller.remove);
};

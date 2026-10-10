import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { UserController } from "./controller.js";
import { UserRepository } from "./repository.js";
import { UserService } from "./service.js";

const repository = new UserRepository();
const service = new UserService(repository);
const controller = new UserController(service);

export const userRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("acesso.usuarios.ver", "acesso.usuarios.gerenciar") };
  const gerenciar = { preHandler: requirePermission("acesso.usuarios.gerenciar") };

  app.get("/usuarios", ver, controller.list);
  app.patch("/usuarios/:id/email", gerenciar, controller.changeEmail);
};

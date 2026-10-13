import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { inviteService } from "../convites/routes.js";
import { UserController } from "./controller.js";
import { UserRepository } from "./repository.js";
import { UserService } from "./service.js";

const repository = new UserRepository();
const service = new UserService(repository);
// Também atende GET /pessoas/:id/acesso (aba Acesso do perfil).
export const userController = new UserController(service, inviteService);

export const userRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("acesso.usuarios.ver", "acesso.usuarios.gerenciar") };
  const gerenciar = { preHandler: requirePermission("acesso.usuarios.gerenciar") };

  app.get("/usuarios", ver, userController.list);
  app.put("/usuarios/:id/atribuicoes", gerenciar, userController.updateAssignments);
  app.post("/usuarios/:id/desativar", gerenciar, userController.deactivate);
  app.post("/usuarios/:id/reativar", gerenciar, userController.reactivate);
  app.post("/usuarios/:id/encerrar-sessoes", gerenciar, userController.endSessions);
  app.patch("/usuarios/:id/email", gerenciar, userController.changeEmail);
};

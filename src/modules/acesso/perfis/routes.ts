import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { AccessProfileController } from "./controller.js";
import { AccessProfileRepository } from "./repository.js";
import { AccessProfileService } from "./service.js";

const repository = new AccessProfileRepository();
const service = new AccessProfileService(repository);
const controller = new AccessProfileController(service);

// Criar, editar, duplicar e excluir perfis ficam na Sprint 8.
export const accessProfileRoutes: FastifyPluginAsync = async (app) => {
  const gerenciar = { preHandler: requirePermission("acesso.perfis.gerenciar") };

  app.get("/perfis", gerenciar, controller.list);
  app.post("/perfis/:id/restaurar", gerenciar, controller.restore);
};

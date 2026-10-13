import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { AccessProfileController } from "./controller.js";
import { AccessProfileRepository } from "./repository.js";
import { AccessProfileService } from "./service.js";

const repository = new AccessProfileRepository();
const service = new AccessProfileService(repository);
const controller = new AccessProfileController(service);

// Configurações › Perfis de acesso (RF-PF01 a RF-PF04). Duplicar é um POST com a cópia.
export const accessProfileRoutes: FastifyPluginAsync = async (app) => {
  const gerenciar = { preHandler: requirePermission("acesso.perfis.gerenciar") };
  // Quem dá acesso (convite) escolhe entre os perfis da igreja.
  const listar = { preHandler: requirePermission("acesso.perfis.gerenciar", "acesso.usuarios.gerenciar") };

  app.get("/perfis", listar, controller.list);
  app.post("/perfis", gerenciar, controller.create);
  app.patch("/perfis/:id", gerenciar, controller.update);
  app.delete("/perfis/:id", gerenciar, controller.delete);
  app.post("/perfis/:id/restaurar", gerenciar, controller.restore);
};

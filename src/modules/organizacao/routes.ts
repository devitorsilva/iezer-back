import { FastifyPluginAsync } from "fastify";
import { requireChurchPermission } from "../../lib/access.js";
import { OrganizationController } from "./controller.js";
import { OrganizationRepository } from "./repository.js";
import { OrganizationService } from "./service.js";

const repository = new OrganizationRepository();
export const organizationService = new OrganizationService(repository);
const controller = new OrganizationController(organizationService);

// Configurações › Organização: exige "Gerenciar organização" na sede.
export const organizacaoRoutes: FastifyPluginAsync = async (app) => {
  const gerenciar = { preHandler: requireChurchPermission("organizacoes.gerenciar") };

  app.get("/", gerenciar, controller.get);
  app.patch("/", gerenciar, controller.updateChurch);
  app.post("/congregacoes", gerenciar, controller.createCongregation);
  app.patch("/congregacoes/:id", gerenciar, controller.updateCongregation);
  app.post("/congregacoes-conferidas", gerenciar, controller.markCongregationsReviewed);
  app.put("/encarregado-lgpd", gerenciar, controller.setLgpdOfficer);
  app.delete("/encarregado-lgpd", gerenciar, controller.removeLgpdOfficer);
};

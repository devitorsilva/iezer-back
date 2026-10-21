import { FastifyPluginAsync } from "fastify";
import { requireTeamRole } from "../../../lib/team.js";
import { organizationService } from "../../organizacao/routes.js";
import { ChurchAdminController } from "./controller.js";
import { ChurchAdminRepository } from "./repository.js";
import { ChurchAdminService } from "./service.js";

const repository = new ChurchAdminRepository();
export const churchAdminService = new ChurchAdminService(repository);
const controller = new ChurchAdminController(churchAdminService, organizationService);

// Igrejas no back-office (RF-BO11 a RF-BO18, RF-BO29). Ver e reenviar convite de admin: todos os
// papéis. Criar e editar: Administrador iEzer e Implantação (PRD Back-office › Papéis internos).
export const churchAdminRoutes: FastifyPluginAsync = async (app) => {
  const implantacao = { preHandler: requireTeamRole("IMPLANTACAO") };

  app.get("/", controller.list);
  app.post("/", implantacao, controller.create);
  app.get("/:id", controller.get);
  app.patch("/:id", implantacao, controller.updateChurch);
  app.post("/:id/congregacoes", implantacao, controller.createCongregation);
  app.patch("/:id/congregacoes/:congregationId", implantacao, controller.updateCongregation);
  app.put("/:id/contatos/responsavel", implantacao, controller.setAccountOwnerContact);
  app.put("/:id/contatos/encarregado-lgpd", implantacao, controller.setLgpdOfficer);
  app.delete("/:id/contatos/encarregado-lgpd", implantacao, controller.removeLgpdOfficer);
  app.get("/:id/usuarios", controller.users);
  app.post("/:id/convites/:inviteId/reenviar", controller.resendInvite);
};

import { FastifyPluginAsync } from "fastify";
import { requireTeamRole } from "../../../lib/team.js";
import { organizationService } from "../../organizacao/routes.js";
import { ChurchAdminController } from "./controller.js";
import { ChurchAdminRepository } from "./repository.js";
import { DOCUMENT_BODY_LIMIT } from "./schemas.js";
import { ChurchAdminService } from "./service.js";

const repository = new ChurchAdminRepository();
export const churchAdminService = new ChurchAdminService(repository);
const controller = new ChurchAdminController(churchAdminService, organizationService);

// Igrejas no back-office (RF-BO11 a RF-BO21, RF-BO25 a RF-BO29). Ver e reenviar convite de admin:
// todos os papéis. Criar, editar, marcar como ativa, trocar o responsável e abrir os documentos:
// Administrador iEzer e Implantação. Suspender e reativar: só o Administrador iEzer (PRD Back-office
// › Papéis internos).
export const churchAdminRoutes: FastifyPluginAsync = async (app) => {
  const implantacao = { preHandler: requireTeamRole("IMPLANTACAO") };
  const administrador = { preHandler: requireTeamRole("ADMINISTRADOR") };

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
  app.post("/:id/ativar", implantacao, controller.activate);
  app.post("/:id/suspender", administrador, controller.suspend);
  app.post("/:id/reativar", administrador, controller.reactivate);
  app.post("/:id/responsavel/troca", { ...implantacao, bodyLimit: DOCUMENT_BODY_LIMIT }, controller.changeAccountOwner);
  app.get("/:id/responsavel/historico", controller.accountOwnerHistory);
  app.get("/:id/documentos/:documentId/link", implantacao, controller.documentLink);
};

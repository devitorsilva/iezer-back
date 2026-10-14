import { FastifyPluginAsync } from "fastify";
import { requireChurchPermission, requirePermission } from "../../../lib/access.js";
import { SupportGrantController } from "./controller.js";
import { SupportGrantRepository } from "./repository.js";
import { SupportGrantService } from "./service.js";

export const supportGrantRepository = new SupportGrantRepository();
const service = new SupportGrantService(supportGrantRepository);
const controller = new SupportGrantController(service);

// Configurações › Acesso do suporte. A leitura (tela e faixa, RF-SP04) também serve a quem
// administra acessos ou vê a auditoria; decidir exige "Autorizar acesso do suporte" na sede (RF-SP03).
export const supportGrantRoutes: FastifyPluginAsync = async (app) => {
  const ver = {
    preHandler: requirePermission("acesso.suporte.autorizar", "acesso.perfis.gerenciar", "auditoria.ver"),
  };
  const autorizar = { preHandler: requireChurchPermission("acesso.suporte.autorizar") };

  app.get("/suporte", ver, controller.list);
  app.post("/suporte", autorizar, controller.authorize);
  app.post("/suporte/:id/aprovar", autorizar, controller.approve);
  app.post("/suporte/:id/recusar", autorizar, controller.refuse);
  app.post("/suporte/:id/revogar", autorizar, controller.revoke);
};

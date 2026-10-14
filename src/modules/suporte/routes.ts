import { FastifyPluginAsync } from "fastify";
import { requireTeamRole } from "../../lib/team.js";
import { supportGrantRepository } from "../acesso/suporte/routes.js";
import { BackOfficeController } from "./controller.js";
import { BackOfficeService } from "./service.js";

const service = new BackOfficeService(supportGrantRepository);
const controller = new BackOfficeController(service);

// Back-office do suporte: fora da organização ativa, porque atende todas as igrejas. Só a equipe
// com o papel Suporte (ou Administrador iEzer), com o app autenticador pelo requireSession.
// Muda para /api/admin/* na Sprint 19.
export const backOfficeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireTeamRole("SUPORTE"));

  app.get("/igrejas", controller.churches);
  app.post("/igrejas/:churchId/recuperar-admin", controller.recoverAdmin);
  app.get("/acessos", controller.grants);
  app.post("/acessos/:id/cancelar", controller.cancel);
  app.post("/acessos/:id/encerrar", controller.end);
  app.post("/pedidos", controller.request);
  app.post("/emergencias", controller.emergency);
  app.post("/emergencias/:id/aprovar", controller.approveEmergency);
};

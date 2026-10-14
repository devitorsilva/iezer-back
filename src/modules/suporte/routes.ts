import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { supportGrantRepository } from "../acesso/suporte/routes.js";
import { BackOfficeController } from "./controller.js";
import { BackOfficeService } from "./service.js";

const service = new BackOfficeService(supportGrantRepository);
const controller = new BackOfficeController(service);

// Só o atendente do suporte (conta nominal, 2FA obrigatório pelo requireSession: RF-SP06, RT-AB14).
async function requireSupportAgent(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.isSupportAgent === true) return;

  return reply.code(403).send({
    statusCode: 403,
    code: "SUPPORT_AGENT_REQUIRED",
    message: "Área restrita à equipe de suporte do iEzer.",
  });
}

// Back-office do suporte: fora da organização ativa, porque atende todas as igrejas.
export const backOfficeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireSupportAgent);

  app.get("/igrejas", controller.churches);
  app.post("/igrejas/:churchId/recuperar-admin", controller.recoverAdmin);
  app.get("/acessos", controller.grants);
  app.post("/acessos/:id/cancelar", controller.cancel);
  app.post("/acessos/:id/encerrar", controller.end);
  app.post("/pedidos", controller.request);
  app.post("/emergencias", controller.emergency);
  app.post("/emergencias/:id/aprovar", controller.approveEmergency);
};

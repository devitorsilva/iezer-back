import { FastifyPluginAsync } from "fastify";
import { rateLimitByIp } from "../../../lib/rate-limit.js";
import { AccountController } from "./controller.js";
import { AccountRepository } from "./repository.js";
import { AccountService } from "./service.js";

const repository = new AccountRepository();
const service = new AccountService(repository);
const controller = new AccountController(service);

// Minha conta (RF-MC02 a RF-MC06), em /api/me: só a sessão, sem organização ativa nem termos.
// Responde também a quem ainda precisa configurar o 2FA (require-session.ts).
export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.get("/seguranca", controller.security);
  app.post("/senha", { preHandler: rateLimitByIp("me-senha", 10, 15 * 60_000) }, controller.changePassword);
  app.post(
    "/2fa/reconfigurar",
    { preHandler: rateLimitByIp("me-2fa-reconfigurar", 10, 15 * 60_000) },
    controller.reconfigureTwoFactor,
  );
  app.get("/sessoes", controller.listSessions);
  app.delete("/sessoes/:id", controller.endSession);
  app.post("/sessoes/encerrar-outras", controller.endOtherSessions);
  app.get("/acessos", controller.myAccess);
  app.post("/email", controller.requestEmailChange);
};

// Confirmação da troca de e-mail pelo link (público, como o convite; RT-AB09).
export const publicEmailRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/confirmar/:token",
    { preHandler: rateLimitByIp("email-confirmar", 10, 15 * 60_000) },
    controller.confirmEmailChange,
  );
};

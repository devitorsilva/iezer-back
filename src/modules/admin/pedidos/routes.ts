import { FastifyPluginAsync } from "fastify";
import { requireTeamRole } from "../../../lib/team.js";
import { supportGrantRepository } from "../../acesso/suporte/routes.js";
import { SupportRequestController } from "./controller.js";
import { SupportRequestService } from "./service.js";

const service = new SupportRequestService(supportGrantRepository);
const controller = new SupportRequestController(service);

// Pedidos de acesso (RF-BO34 a RF-BO40; PRD Back-office › Papéis internos). Ver: todos os papéis.
// Pedir, cancelar e encerrar: Suporte e Implantação (que só pede leitura, conferido no service).
// Emergência: Suporte. Aprovar e recusar escrita e emergência: Administrador iEzer.
export const supportRequestRoutes: FastifyPluginAsync = async (app) => {
  const pedir = { preHandler: requireTeamRole("SUPORTE", "IMPLANTACAO") };
  const suporte = { preHandler: requireTeamRole("SUPORTE") };
  const administrador = { preHandler: requireTeamRole("ADMINISTRADOR") };

  app.get("/", controller.list);
  app.post("/", pedir, controller.request);
  app.post("/emergencia", suporte, controller.emergency);
  app.post("/:id/aprovar", administrador, controller.approve);
  app.post("/:id/recusar", administrador, controller.refuse);
  app.post("/:id/cancelar", pedir, controller.cancel);
  app.post("/:id/encerrar", pedir, controller.end);
};

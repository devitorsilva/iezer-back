import { FastifyPluginAsync } from "fastify";
import { requireTeamRole } from "../../../lib/team.js";
import { InternalAuditController } from "./controller.js";
import { InternalAuditRepository } from "./repository.js";
import { InternalAuditService } from "./service.js";

const repository = new InternalAuditRepository();
const service = new InternalAuditService(repository);
// Também atende GET /admin/igrejas/:id/historico (aba Histórico da igreja, todos os papéis).
export const internalAuditController = new InternalAuditController(service);

// Auditoria interna (B11, RF-BO51): só o Administrador iEzer.
export const internalAuditRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireTeamRole("ADMINISTRADOR"));

  app.get("/", internalAuditController.list);
  app.get("/filtros", internalAuditController.filters);
};

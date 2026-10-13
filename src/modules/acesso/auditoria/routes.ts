import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { AuditController } from "./controller.js";
import { AuditRepository } from "./repository.js";
import { AuditService } from "./service.js";

const repository = new AuditRepository();
const service = new AuditService(repository);
// Também atende GET /pessoas/:id/historico (aba Histórico do perfil).
export const auditController = new AuditController(service);

// Configurações › Auditoria (RF-LP02). O escopo vem das organizações com "Ver log de auditoria".
export const auditRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("auditoria.ver") };

  app.get("/auditoria", ver, auditController.list);
  app.get("/auditoria/filtros", ver, auditController.filters);
  app.get("/auditoria/exportar", ver, auditController.export);
};

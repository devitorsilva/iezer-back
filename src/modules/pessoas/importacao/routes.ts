import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { ImportController } from "./controller.js";
import { ImportRepository } from "./repository.js";
import { IMPORT_BODY_LIMIT } from "./schemas.js";
import { ImportService } from "./service.js";

const repository = new ImportRepository();
const service = new ImportService(repository);
const controller = new ImportController(service);

// Importação pela planilha modelo (RF-I01 a RF-I08, RT-B10).
export const importRoutes: FastifyPluginAsync = async (app) => {
  const importar = { preHandler: requirePermission("pessoas.importar") };

  app.get("/importacao/modelo", importar, controller.template);
  app.post("/importacao/previa", { ...importar, bodyLimit: IMPORT_BODY_LIMIT }, controller.preview);
  app.post("/importacao/confirmar", { ...importar, bodyLimit: IMPORT_BODY_LIMIT }, controller.confirm);
};

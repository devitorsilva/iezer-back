import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { PersonRelationController } from "./controller.js";
import { PersonRelationRepository } from "./repository.js";
import { PersonRelationService } from "./service.js";

export const personRelationRepository = new PersonRelationRepository();
export const personRelationService = new PersonRelationService(personRelationRepository);
const controller = new PersonRelationController(personRelationService);

export const personRelationRoutes: FastifyPluginAsync = async (app) => {
  const editar = { preHandler: requirePermission("pessoas.editar") };

  app.get("/:id/parentes", { preHandler: requirePermission("pessoas.ver") }, controller.list);
  app.post("/:id/parentes", editar, controller.add);
  app.delete("/:id/parentes/:relationId", editar, controller.remove);
};

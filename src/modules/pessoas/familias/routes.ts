import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { FamilyController } from "./controller.js";
import { FamilyRepository } from "./repository.js";
import { FamilyService } from "./service.js";

const repository = new FamilyRepository();
const service = new FamilyService(repository);
const controller = new FamilyController(service);

export const familyRoutes: FastifyPluginAsync = async (app) => {
  const editar = { preHandler: requirePermission("pessoas.editar") };

  app.post("/familias", editar, controller.create);
  app.patch("/familias/:id", editar, controller.update);
  app.post("/familias/:id/membros", editar, controller.addMember);
  app.patch("/familias/:id/membros/:personId", editar, controller.updateMember);
  app.delete("/familias/:id/membros/:personId", editar, controller.removeMember);
};

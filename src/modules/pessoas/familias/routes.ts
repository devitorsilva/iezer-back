import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { FamilyController } from "./controller.js";
import { personService } from "../pessoas/routes.js";
import { FamilyRepository } from "./repository.js";
import { FamilyService } from "./service.js";

const repository = new FamilyRepository();
const service = new FamilyService(repository, personService);
const controller = new FamilyController(service);

export const familyRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("pessoas.ver") };
  const editar = { preHandler: requirePermission("pessoas.editar") };

  app.get("/familias", ver, controller.list);
  app.get("/familias/:id", ver, controller.getById);
  app.post("/familias", editar, controller.create);
  app.patch("/familias/:id", editar, controller.update);
  app.post("/familias/:id/membros", editar, controller.addMember);
  app.patch("/familias/:id/membros/:personId", editar, controller.updateMember);
  app.delete("/familias/:id/membros/:personId", editar, controller.removeMember);
  app.patch("/familias/:id/contato-principal", editar, controller.setPrimaryContact);
  app.patch("/familias/:id/endereco", editar, controller.updateAddress);
};

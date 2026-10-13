import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { userController } from "../../acesso/usuarios/routes.js";
import { churchListRepository } from "../listas/routes.js";
import { PersonController } from "./controller.js";
import { PersonRepository } from "./repository.js";
import { PersonService } from "./service.js";

export const personRepository = new PersonRepository();
export const personService = new PersonService(personRepository, churchListRepository);
const controller = new PersonController(personService);

export const personRoutes: FastifyPluginAsync = async (app) => {
  const ver = { preHandler: requirePermission("pessoas.ver") };

  app.get("/", ver, controller.list);
  app.get("/duplicados", ver, controller.duplicates);
  app.get("/:id", ver, controller.getById);
  app.get("/:id/contribuicoes", { preHandler: requirePermission("pessoas.contribuicoes.ver") }, controller.contributions);
  app.get(
    "/:id/acesso",
    { preHandler: requirePermission("acesso.usuarios.ver", "acesso.usuarios.gerenciar") },
    userController.personAccess,
  );
  app.post("/", { preHandler: requirePermission("pessoas.criar") }, controller.create);
  app.patch("/:id", { preHandler: requirePermission("pessoas.editar") }, controller.update);
  app.delete("/:id", { preHandler: requirePermission("pessoas.apagar_registro") }, controller.remove);
};

import { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../../lib/access.js";
import { churchListRepository } from "../listas/routes.js";
import { personRepository } from "../pessoas/routes.js";
import { LifecycleController } from "./controller.js";
import { LifecycleRepository } from "./repository.js";
import { LifecycleService } from "./service.js";

const repository = new LifecycleRepository();
const service = new LifecycleService(repository, personRepository, churchListRepository);
const controller = new LifecycleController(service);

// RT-B02: cada ação de ciclo de vida é um endpoint próprio, para garantir o evento na linha do tempo.
export const lifecycleRoutes: FastifyPluginAsync = async (app) => {
  const situacao = { preHandler: requirePermission("pessoas.alterar_situacao") };

  app.get("/:id/linha-do-tempo", { preHandler: requirePermission("pessoas.ver") }, controller.timeline);
  app.post("/:id/promover", { preHandler: requirePermission("pessoas.promover_vinculo") }, controller.promote);
  app.post("/:id/inativar", situacao, controller.inactivate);
  app.post("/:id/transferir", situacao, controller.transfer);
  app.post("/:id/desligar", situacao, controller.dismiss);
  app.post("/:id/falecimento", situacao, controller.registerDeath);
  app.post("/:id/reativar", situacao, controller.reactivate);
  app.post(
    "/:id/acompanhamentos",
    { preHandler: requirePermission("pessoas.acompanhamento.registrar") },
    controller.registerFollowUp,
  );
};

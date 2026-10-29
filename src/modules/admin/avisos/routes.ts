import { FastifyPluginAsync } from "fastify";
import { requireTeamRole } from "../../../lib/team.js";
import { AnnouncementController } from "./controller.js";
import { AnnouncementRepository } from "./repository.js";
import { AnnouncementService } from "./service.js";

const repository = new AnnouncementRepository();
const service = new AnnouncementService(repository);
const controller = new AnnouncementController(service);

// Avisos em massa (B13, RF-BO44 a RF-BO49). Ver: Suporte (para responder às igrejas) e
// Administrador iEzer; criar, editar, publicar, encerrar e apagar: só o Administrador.
export const announcementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireTeamRole("SUPORTE"));
  const administrador = { preHandler: requireTeamRole("ADMINISTRADOR") };

  app.get("/", controller.list);
  app.get("/:id", controller.get);
  app.post("/", administrador, controller.create);
  app.put("/:id", administrador, controller.update);
  app.post("/:id/publicar", administrador, controller.publish);
  app.post("/:id/encerrar", administrador, controller.close);
  app.delete("/:id", administrador, controller.remove);
};

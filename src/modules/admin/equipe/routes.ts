import { FastifyPluginAsync } from "fastify";
import { requireTeamRole } from "../../../lib/team.js";
import { TeamController } from "./controller.js";
import { TeamRepository } from "./repository.js";
import { TeamService } from "./service.js";

export const teamRepository = new TeamRepository();
export const teamService = new TeamService(teamRepository);
const controller = new TeamController(teamService);

// Equipe iEzer (RF-BO06 a RF-BO10), só para o Administrador iEzer. O aceite público do convite
// está em src/modules/admin/routes.ts.
export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireTeamRole("ADMINISTRADOR"));

  app.get("/", controller.list);
  app.post("/convites", controller.invite);
  app.post("/convites/:id/reenviar", controller.resendInvite);
  app.post("/convites/:id/cancelar", controller.cancelInvite);
  app.patch("/:id/papeis", controller.changeRoles);
  app.post("/:id/desativar", controller.deactivate);
  app.post("/:id/reativar", controller.reactivate);
  app.post("/:id/autenticador/redefinir", controller.resetAuthenticator);
};

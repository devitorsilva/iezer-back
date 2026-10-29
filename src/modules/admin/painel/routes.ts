import { FastifyPluginAsync } from "fastify";
import { HealthRepository } from "./repository.js";
import { HealthService } from "./service.js";

const healthService = new HealthService(new HealthRepository());

// Painel de saúde, página inicial do back-office: os três papéis veem (PRD Back-office › Papéis internos).
export const healthPanelRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => healthService.get());
};

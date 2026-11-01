import { FastifyPluginAsync } from "fastify";
import { getRequestContext, requirePermission } from "../../../lib/access.js";
import { FinancePanelRepository } from "./repository.js";
import { financePanelQuerySchema } from "./schemas.js";
import { FinancePanelService } from "./service.js";

const service = new FinancePanelService(new FinancePanelRepository());

// Cartões e faixa de vencidas do Painel (organização ativa ou "Todas as congregações").
export const financePanelRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/painel",
    { preHandler: requirePermission("financeiro.pagar.ver", "financeiro.receber.ver") },
    async (request) => {
      const { periodo } = financePanelQuerySchema.parse(request.query);
      return service.get(getRequestContext(request), periodo);
    },
  );
};

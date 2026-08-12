import { FastifyPluginAsync } from "fastify";

export const relatoriosRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "relatorios",
    sections: ["dashboard-financeiro", "visao-por-categoria", "exportacoes"],
    status: "active",
  }));
};


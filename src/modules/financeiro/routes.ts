import { FastifyPluginAsync } from "fastify";

const sections = ["contas-a-pagar", "contas-a-receber"];

export const financeiroRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "financeiro",
    sections,
    openFinance: false,
    status: "active",
  }));
};


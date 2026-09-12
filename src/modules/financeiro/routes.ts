import { FastifyPluginAsync } from "fastify";
import { payableRoutes } from "./contas-a-pagar/routes.js";
import { receivableRoutes } from "./contas-a-receber/routes.js";

const sections = ["contas-a-pagar", "contas-a-receber"];

export const financeiroRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "financeiro",
    sections,
    openFinance: false,
    status: "active",
  }));

  await app.register(payableRoutes);
  await app.register(receivableRoutes);
};

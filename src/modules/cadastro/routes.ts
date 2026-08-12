import { FastifyPluginAsync } from "fastify";

const sections = [
  "centro-de-custo",
  "bancos-contas",
  "categoria",
  "fornecedor",
];

export const cadastroRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "cadastro",
    sections,
    status: "active",
  }));
};


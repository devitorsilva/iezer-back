import { FastifyPluginAsync } from "fastify";

const modules = [
  "mensageria",
  "compras",
  "controle-patrimonial",
  "membros",
  "configuracoes",
  "portal-transparencia",
  "conteudo",
];

export const placeholdersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    status: "planned",
    modules,
  }));
};

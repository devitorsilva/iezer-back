import { FastifyPluginAsync } from "fastify";
import { bankAccountRoutes } from "./bancos-contas/routes.js";
import { costCenterRoutes } from "./centro-de-custo/routes.js";
import { categoryRoutes } from "./categorias/routes.js";
import { memberRoutes } from "./membros/routes.js";
import { supplierRoutes } from "./fornecedores/routes.js";

const sections = [
  "centro-de-custo",
  "bancos-contas",
  "categorias",
  "fornecedores",
  "membros",
];

export const cadastroRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "cadastro",
    sections,
    status: "active",
  }));

  await app.register(bankAccountRoutes);
  await app.register(costCenterRoutes);
  await app.register(categoryRoutes);
  await app.register(supplierRoutes);
  await app.register(memberRoutes);
};

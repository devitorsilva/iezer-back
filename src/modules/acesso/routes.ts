import { FastifyPluginAsync } from "fastify";
import { accessProfileRoutes } from "./perfis/routes.js";
import { permissionRoutes } from "./permissoes/routes.js";

// Só exige sessão: o catálogo não depende de organização.
export const acessoCatalogRoutes: FastifyPluginAsync = async (app) => {
  await app.register(permissionRoutes);
};

// Dentro do escopo com organização ativa.
export const acessoRoutes: FastifyPluginAsync = async (app) => {
  await app.register(accessProfileRoutes);
};

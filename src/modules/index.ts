import { FastifyPluginAsync } from "fastify";
import { authRoutes } from "./auth/routes.js";
import { cadastroRoutes } from "./cadastro/routes.js";
import { financeiroRoutes } from "./financeiro/routes.js";
import { relatoriosRoutes } from "./relatorios/routes.js";
import { placeholdersRoutes } from "./placeholders/routes.js";

export const registerModuleRoutes: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(cadastroRoutes, { prefix: "/cadastro" });
  await app.register(financeiroRoutes, { prefix: "/financeiro" });
  await app.register(relatoriosRoutes, { prefix: "/relatorios" });
  await app.register(placeholdersRoutes, { prefix: "/modulos" });
};


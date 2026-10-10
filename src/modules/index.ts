import { FastifyPluginAsync } from "fastify";
import { requireSession } from "../lib/require-session.js";
import { authRoutes } from "./auth/routes.js";
import { cadastroRoutes } from "./cadastro/routes.js";
import { financeiroRoutes } from "./financeiro/routes.js";
import { meRoutes } from "./me/routes.js";
import { relatoriosRoutes } from "./relatorios/routes.js";
import { placeholdersRoutes } from "./placeholders/routes.js";

export const registerModuleRoutes: FastifyPluginAsync = async (app) => {
  // Público: handler do Better Auth.
  await app.register(authRoutes, { prefix: "/auth" });

  // Todo o resto exige sessão.
  await app.register(async (protectedApp) => {
    protectedApp.decorateRequest("user");
    protectedApp.decorateRequest("session");
    protectedApp.addHook("onRequest", requireSession);

    await protectedApp.register(meRoutes, { prefix: "/me" });
    await protectedApp.register(cadastroRoutes, { prefix: "/cadastro" });
    await protectedApp.register(financeiroRoutes, { prefix: "/financeiro" });
    await protectedApp.register(relatoriosRoutes, { prefix: "/relatorios" });
    await protectedApp.register(placeholdersRoutes, { prefix: "/modulos" });
  });
};

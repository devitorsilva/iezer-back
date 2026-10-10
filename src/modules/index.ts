import { FastifyPluginAsync } from "fastify";
import { resolveOrganization } from "../lib/access.js";
import { requireSession } from "../lib/require-session.js";
import { acessoCatalogRoutes, acessoRoutes } from "./acesso/routes.js";
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
    protectedApp.decorateRequest("access");
    protectedApp.addHook("onRequest", requireSession);

    await protectedApp.register(meRoutes, { prefix: "/me" });
    await protectedApp.register(acessoCatalogRoutes, { prefix: "/acesso" });
    await protectedApp.register(placeholdersRoutes, { prefix: "/modulos" });

    // Rotas de dados: organização ativa (X-Organization-Id) e permissões por rota.
    await protectedApp.register(async (organizationApp) => {
      organizationApp.addHook("onRequest", resolveOrganization);

      await organizationApp.register(acessoRoutes, { prefix: "/acesso" });
      await organizationApp.register(cadastroRoutes, { prefix: "/cadastro" });
      await organizationApp.register(financeiroRoutes, { prefix: "/financeiro" });
      await organizationApp.register(relatoriosRoutes, { prefix: "/relatorios" });
    });
  });
};

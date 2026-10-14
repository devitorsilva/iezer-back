import { FastifyPluginAsync } from "fastify";
import { resolveOrganization } from "../lib/access.js";
import { requireSession } from "../lib/require-session.js";
import { logSupportRead } from "../lib/support-log.js";
import { acessoCatalogRoutes, acessoRoutes } from "./acesso/routes.js";
import { authRoutes } from "./auth/routes.js";
import { cadastroRoutes } from "./cadastro/routes.js";
import { publicInviteRoutes } from "./convites/routes.js";
import { financeiroRoutes } from "./financeiro/routes.js";
import { publicEmailRoutes } from "./me/conta/routes.js";
import { meRoutes } from "./me/routes.js";
import { organizacaoRoutes } from "./organizacao/routes.js";
import { pessoasRoutes } from "./pessoas/routes.js";
import { relatoriosRoutes } from "./relatorios/routes.js";
import { backOfficeRoutes } from "./suporte/routes.js";
import { placeholdersRoutes } from "./placeholders/routes.js";

export const registerModuleRoutes: FastifyPluginAsync = async (app) => {
  // Público: handler do Better Auth, página do convite e confirmação da troca de e-mail.
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(publicInviteRoutes, { prefix: "/convites" });
  await app.register(publicEmailRoutes, { prefix: "/email" });

  // Todo o resto exige sessão.
  await app.register(async (protectedApp) => {
    protectedApp.decorateRequest("user");
    protectedApp.decorateRequest("session");
    protectedApp.decorateRequest("access");
    protectedApp.addHook("onRequest", requireSession);

    await protectedApp.register(meRoutes, { prefix: "/me" });
    await protectedApp.register(acessoCatalogRoutes, { prefix: "/acesso" });
    await protectedApp.register(placeholdersRoutes, { prefix: "/modulos" });
    // Back-office do suporte do iEzer (só atendentes).
    await protectedApp.register(backOfficeRoutes, { prefix: "/suporte" });

    // Rotas de dados: organização ativa (X-Organization-Id) e permissões por rota.
    await protectedApp.register(async (organizationApp) => {
      organizationApp.addHook("onRequest", resolveOrganization);
      // Leituras do suporte no log (RF-SP07); depois do parse, para ter os parâmetros da rota.
      organizationApp.addHook("preHandler", logSupportRead);

      await organizationApp.register(acessoRoutes, { prefix: "/acesso" });
      await organizationApp.register(organizacaoRoutes, { prefix: "/organizacao" });
      await organizationApp.register(pessoasRoutes, { prefix: "/pessoas" });
      await organizationApp.register(cadastroRoutes, { prefix: "/cadastro" });
      await organizationApp.register(financeiroRoutes, { prefix: "/financeiro" });
      await organizationApp.register(relatoriosRoutes, { prefix: "/relatorios" });
    });
  });
};

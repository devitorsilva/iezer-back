import { FastifyPluginAsync } from "fastify";
import { auditRoutes } from "./auditoria/routes.js";
import { inviteRoutes } from "./convites/routes.js";
import { onboardingRoutes } from "./onboarding/routes.js";
import { accessProfileRoutes } from "./perfis/routes.js";
import { permissionRoutes } from "./permissoes/routes.js";
import { supportGrantRoutes } from "./suporte/routes.js";
import { userRoutes } from "./usuarios/routes.js";

// Só exige sessão: o catálogo não depende de organização.
export const acessoCatalogRoutes: FastifyPluginAsync = async (app) => {
  await app.register(permissionRoutes);
};

// Dentro do escopo com organização ativa.
export const acessoRoutes: FastifyPluginAsync = async (app) => {
  await app.register(accessProfileRoutes);
  await app.register(inviteRoutes);
  await app.register(userRoutes);
  await app.register(onboardingRoutes);
  await app.register(auditRoutes);
  await app.register(supportGrantRoutes);
};

import { FastifyPluginAsync } from "fastify";
import { PERMISSION_MODULE_NAMES, permissionCatalog } from "./catalog/index.js";

const items = permissionCatalog.map((permission) => ({
  key: permission.key,
  name: permission.name,
  description: permission.description,
  module: permission.module,
  moduleName: PERMISSION_MODULE_NAMES[permission.module],
  protected: permission.protected,
  dependsOn: permission.dependsOn,
  group: "group" in permission ? permission.group : null,
}));

// GET /api/acesso/permissoes (RT-AB05): catálogo fixo, igual para todas as igrejas.
export const permissionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/permissoes", async () => ({ items }));
};

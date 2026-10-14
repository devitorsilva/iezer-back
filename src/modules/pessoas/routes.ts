import { FastifyPluginAsync } from "fastify";
import { lifecycleRoutes } from "./ciclo-vida/routes.js";
import { familyRoutes } from "./familias/routes.js";
import { importRoutes } from "./importacao/routes.js";
import { churchListRoutes } from "./listas/routes.js";
import { personRoutes } from "./pessoas/routes.js";

const sections = ["listas", "familias", "importacao"];

export const pessoasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "pessoas",
    sections,
    status: "active",
  }));

  await app.register(churchListRoutes);
  await app.register(familyRoutes);
  await app.register(importRoutes);
  await app.register(personRoutes);
  await app.register(lifecycleRoutes);
};

import { FastifyPluginAsync } from "fastify";
import { familyRoutes } from "./familias/routes.js";
import { churchListRoutes } from "./listas/routes.js";
import { personRoutes } from "./pessoas/routes.js";

const sections = ["listas", "familias"];

export const pessoasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "pessoas",
    sections,
    status: "active",
  }));

  await app.register(churchListRoutes);
  await app.register(familyRoutes);
  await app.register(personRoutes);
};

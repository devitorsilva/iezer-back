import { FastifyPluginAsync } from "fastify";
import { churchListRoutes } from "./listas/routes.js";
import { personRoutes } from "./pessoas/routes.js";

const sections = ["listas"];

export const pessoasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "pessoas",
    sections,
    status: "active",
  }));

  await app.register(churchListRoutes);
  await app.register(personRoutes);
};

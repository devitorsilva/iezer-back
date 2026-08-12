import { FastifyPluginAsync } from "fastify";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get("/overview", async () => ({
    module: "login",
    features: ["login", "integracao-email"],
    status: "planned",
  }));
};


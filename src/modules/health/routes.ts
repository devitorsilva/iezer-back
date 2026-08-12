import { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    status: "ok",
    service: "iezer-api",
    timestamp: new Date().toISOString(),
  }));
};


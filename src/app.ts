import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { registerModuleRoutes } from "./modules/index.js";
import { healthRoutes } from "./modules/health/routes.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: env.WEB_ORIGIN,
  });
  app.register(sensible);

  app.register(healthRoutes, { prefix: "/health" });
  app.register(registerModuleRoutes, { prefix: "/api" });

  return app;
}


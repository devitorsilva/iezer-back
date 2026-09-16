import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { Prisma } from "@prisma/client";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { registerModuleRoutes } from "./modules/index.js";
import { healthRoutes } from "./modules/health/routes.js";

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  if (origin === env.WEB_ORIGIN) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);

    if (
      (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1") &&
      /^517\d$/.test(parsedOrigin.port)
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed"), false);
    },
  });
  app.register(sensible);

  app.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof Error &&
      (error.message.includes("tenant/user") ||
        error.message.includes("Tenant or user not found"))
    ) {
      return reply.code(503).send({
        message:
          "A API está no ar, mas a connection string do Supabase não foi reconhecida. Verifique o projeto, o usuário do pooler e se o banco está ativo.",
      });
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return reply.code(503).send({
        message:
          "A API está no ar, mas a conexão com o banco Supabase não está disponível no momento.",
      });
    }

    if (
      error instanceof Error &&
      error.message.includes("Can't reach database server")
    ) {
      return reply.code(503).send({
        message:
          "A API está no ar, mas a conexão com o banco Supabase não está disponível no momento.",
      });
    }

    return reply.send(error);
  });

  app.register(healthRoutes, { prefix: "/health" });
  app.get("/healthz", async () => ({
    status: "ok",
    service: "iezer-back",
  }));
  app.register(registerModuleRoutes, { prefix: "/api" });

  return app;
}

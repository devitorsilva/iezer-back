import { FastifyPluginAsync } from "fastify";
import { MeRepository } from "./repository.js";

const repository = new MeRepository();

// GET /api/me (RT-AB04). Organizações e permissões por organização entram na Sprint 3.
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const user = await repository.findUser(request.user.id);

    if (!user) {
      return reply.unauthorized("Sua sessão expirou. Entre novamente.");
    }

    const { person, ...userData } = user;

    return { user: userData, person };
  });
};

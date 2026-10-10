import { FastifyPluginAsync } from "fastify";
import { loadAccessibleOrganizations } from "../../lib/access.js";
import { MeRepository } from "./repository.js";

const repository = new MeRepository();

// GET /api/me (RT-AB04): usuário, pessoa, organizações alcançadas e permissões em cada uma.
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const user = await repository.findUser(request.user.id);

    if (!user) {
      return reply.unauthorized("Sua sessão expirou. Entre novamente.");
    }

    const { person, ...userData } = user;
    const organizations = await loadAccessibleOrganizations(user.id);

    return {
      user: userData,
      person,
      organizations: organizations.map(({ permissions, ...organization }) => ({
        ...organization,
        permissions: [...permissions].sort(),
      })),
    };
  });
};

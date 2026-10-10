import { FastifyPluginAsync } from "fastify";
import { loadAccessibleOrganizations } from "../../lib/access.js";
import { runAudited } from "../../lib/audit.js";
import { findUserChurch } from "../../lib/church.js";
import { TERMS_VERSION } from "../../lib/terms.js";
import { MeRepository } from "./repository.js";

const repository = new MeRepository();

// GET /api/me (RT-AB04): usuário, pessoa, organizações alcançadas e permissões em cada uma.
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const user = await repository.findUser(request.user.id);

    if (!user) {
      return reply.unauthorized("Sua sessão expirou. Entre novamente.");
    }

    const { person, termsVersion, ...userData } = user;
    const organizations = await loadAccessibleOrganizations(user.id);

    return {
      user: userData,
      // Sem o aceite da versão atual, o front pede os termos antes de liberar o app (RF-CV06).
      terms: { version: TERMS_VERSION, accepted: termsVersion === TERMS_VERSION },
      person,
      organizations: organizations.map(({ permissions, ...organization }) => ({
        ...organization,
        permissions: [...permissions].sort(),
      })),
    };
  });

  // Aceite dos termos de uso e de confidencialidade, com a versão no log (RF-CV06, RF-LP07).
  app.post("/termos", async (request) => {
    const actor = {
      type: "USUARIO" as const,
      userId: request.user.id,
      ip: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    };
    const church = await findUserChurch(request.user.id);

    return runAudited(actor, async (tx, audit) => {
      const acceptedAt = new Date();
      await tx.user.update({
        where: { id: request.user.id },
        data: { termsVersion: TERMS_VERSION, termsAcceptedAt: acceptedAt },
      });
      await audit({
        organizationId: church?.id ?? null,
        module: "ACESSO",
        action: "aceitar_termos",
        targetType: "User",
        targetId: request.user.id,
        after: { termsVersion: TERMS_VERSION, acceptedAt },
      });

      return { version: TERMS_VERSION, accepted: true };
    });
  });
};

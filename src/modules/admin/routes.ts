import { fromNodeHeaders } from "better-auth/node";
import { FastifyPluginAsync } from "fastify";
import { auth } from "../../lib/auth.js";
import { withClientIp } from "../../lib/client-ip.js";
import { prisma } from "../../lib/prisma.js";
import { rateLimitByIp } from "../../lib/rate-limit.js";
import { requireTeamSession } from "../../lib/team.js";
import { TEAM_TERMS_VERSION } from "../../lib/terms.js";
import { teamActionContext } from "./equipe/controller.js";
import { teamRoutes, teamService } from "./equipe/routes.js";
import { acceptTeamInviteSchema, teamTokenParamsSchema } from "./equipe/schemas.js";

// Back-office da equipe iEzer (RT-BB01): só conta da equipe, papel conferido por rota.
// /api/suporte/* continua à parte até a Sprint 19.
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", requireTeamSession);

  // GET /api/admin/me (RT-BB02): membro, papéis, termo e app autenticador. Responde antes do
  // termo e do app autenticador, para o front levar à configuração.
  app.get("/me", async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, name: true, email: true, lastLoginAt: true, twoFactorEnabled: true },
    });
    if (!user || !request.team) return reply.unauthorized("Sua sessão expirou. Entre novamente.");

    const { twoFactorEnabled, ...userData } = user;
    return {
      user: { ...userData, lastLoginAt: userData.lastLoginAt?.toISOString() ?? null },
      memberId: request.team.memberId,
      roles: request.team.roles,
      terms: { version: TEAM_TERMS_VERSION, accepted: request.team.termsVersion === TEAM_TERMS_VERSION },
      // Equipe: 2FA sempre obrigatório e só pelo app autenticador (B2).
      twoFactor: { enabled: twoFactorEnabled && request.team.totpEnabled, required: true },
    };
  });

  app.post("/me/termo", async (request) =>
    teamService.acceptTerms(teamActionContext(request), request.team!.memberId),
  );

  await app.register(teamRoutes, { prefix: "/equipe" });
};

// Convite da equipe, público como o da igreja (RF-BO03), com limite por IP (RT-AB09).
export const publicTeamInviteRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:token", { preHandler: rateLimitByIp("equipe-convite-ver", 30, 60_000) }, async (request) => {
    const { token } = teamTokenParamsSchema.parse(request.params);
    return teamService.peek(token);
  });

  app.post(
    "/:token/aceitar",
    { preHandler: rateLimitByIp("equipe-convite-aceitar", 10, 15 * 60_000) },
    async (request, reply) => {
      const { token } = teamTokenParamsSchema.parse(request.params);
      const input = acceptTeamInviteSchema.parse(request.body);

      const { email } = await teamService.accept(token, input, {
        ip: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });

      // Já entra logado, numa sessão que só configura o app autenticador (require-session.ts).
      try {
        const { headers } = await auth.api.signInEmail({
          body: { email, password: input.password },
          headers: withClientIp(fromNodeHeaders(request.headers), request.ip),
          returnHeaders: true,
        });
        const cookies = headers.getSetCookie();
        if (cookies.length > 0) reply.header("set-cookie", cookies);
        return { signedIn: true };
      } catch (error) {
        request.log.error(error, "login após aceite do convite da equipe falhou");
        return { signedIn: false };
      }
    },
  );
};

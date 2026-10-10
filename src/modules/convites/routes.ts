import { fromNodeHeaders } from "better-auth/node";
import { FastifyPluginAsync } from "fastify";
import { auth } from "../../lib/auth.js";
import { rateLimitByIp } from "../../lib/rate-limit.js";
import { acceptInviteSchema, inviteTokenParamsSchema } from "../acesso/convites/schemas.js";
import { inviteService } from "../acesso/convites/routes.js";

// Rotas públicas do convite (RF-CV05, RF-CV06, RT-AF01), com limite por IP (RT-AB09).
export const publicInviteRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:token", { preHandler: rateLimitByIp("convite-ver", 30, 60_000) }, async (request) => {
    const { token } = inviteTokenParamsSchema.parse(request.params);
    return inviteService.peek(token);
  });

  app.post(
    "/:token/aceitar",
    { preHandler: rateLimitByIp("convite-aceitar", 10, 15 * 60_000) },
    async (request, reply) => {
      const { token } = inviteTokenParamsSchema.parse(request.params);
      const input = acceptInviteSchema.parse(request.body);

      const { email } = await inviteService.accept(token, input, {
        ip: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });

      // Já entra logado. Se o login falhar, a conta existe e a tela manda para o login.
      try {
        const { headers } = await auth.api.signInEmail({
          body: { email, password: input.password },
          headers: fromNodeHeaders(request.headers),
          returnHeaders: true,
        });
        const cookies = headers.getSetCookie();
        if (cookies.length > 0) reply.header("set-cookie", cookies);
        return { signedIn: true };
      } catch (error) {
        request.log.error(error, "login após aceite do convite falhou");
        return { signedIn: false };
      }
    },
  );
};

import { fromNodeHeaders } from "better-auth/node";
import { FastifyReply, FastifyRequest } from "fastify";
import {
  auth,
  AuthSession,
  USER_INACTIVE_CODE,
  USER_INACTIVE_MESSAGE,
} from "./auth.js";
import { findTeamMember, TEAM_TWO_FACTOR_SETUP_MESSAGE, touchTeamSession } from "./team.js";
import {
  requiresTwoFactor,
  TWO_FACTOR_REQUIRED_CODE,
  TWO_FACTOR_REQUIRED_MESSAGE,
  TWO_FACTOR_SETUP_REQUIRED_CODE,
  TWO_FACTOR_SETUP_REQUIRED_MESSAGE,
} from "./two-factor.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthSession["user"];
    session: AuthSession["session"];
  }
}

// Exige sessão válida e usuário ATIVO em toda rota de dados (RT-AB04), com o 2FA concluído
// (sessão do Google) e configurado por quem tem permissão protegida (RF-CV07). Sem o 2FA
// configurado, só /api/me (Minha conta e a tela de configuração) responde.
// Conta da equipe iEzer (RT-BB03): sessão cai após 12h sem uso e o 2FA vale só pelo app
// autenticador; sem ele, só /api/me e /api/admin/me respondem.
export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const { headers, response } = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
    returnHeaders: true,
  });

  // Renovação da sessão (updateAge) devolve cookie novo.
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    reply.header("set-cookie", cookies);
  }

  if (!response) {
    return reply.code(401).send({
      statusCode: 401,
      code: "UNAUTHENTICATED",
      message: "Sua sessão expirou. Entre novamente.",
    });
  }

  if (response.user.status !== "ATIVO") {
    return reply.code(403).send({
      statusCode: 403,
      code: USER_INACTIVE_CODE,
      message: USER_INACTIVE_MESSAGE,
    });
  }

  if (response.session.twoFactorPending) {
    return reply.code(403).send({
      statusCode: 403,
      code: TWO_FACTOR_REQUIRED_CODE,
      message: TWO_FACTOR_REQUIRED_MESSAGE,
    });
  }

  const team = await findTeamMember(response.user.id);
  const url = request.routeOptions.url ?? "";
  const meRoute = url.startsWith("/api/me") || (team !== null && url.startsWith("/api/admin/me"));

  if (team) {
    if (!(await touchTeamSession(response.session.id))) {
      return reply.code(401).send({
        statusCode: 401,
        code: "SESSION_IDLE",
        message: "Sua sessão encerrou depois de 12 horas sem uso. Entre novamente.",
      });
    }

    if (!meRoute && !(response.user.twoFactorEnabled && team.totpEnabled)) {
      return reply.code(403).send({
        statusCode: 403,
        code: TWO_FACTOR_SETUP_REQUIRED_CODE,
        message: TEAM_TWO_FACTOR_SETUP_MESSAGE,
      });
    }
  } else if (!meRoute && !response.user.twoFactorEnabled && (await requiresTwoFactor(response.user.id))) {
    return reply.code(403).send({
      statusCode: 403,
      code: TWO_FACTOR_SETUP_REQUIRED_CODE,
      message: TWO_FACTOR_SETUP_REQUIRED_MESSAGE,
    });
  }

  request.user = response.user;
  request.team = team;
  request.session = response.session;
}

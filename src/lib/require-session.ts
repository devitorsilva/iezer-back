import { fromNodeHeaders } from "better-auth/node";
import { FastifyReply, FastifyRequest } from "fastify";
import {
  auth,
  AuthSession,
  USER_INACTIVE_CODE,
  USER_INACTIVE_MESSAGE,
} from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthSession["user"];
    session: AuthSession["session"];
  }
}

// Exige sessão válida e usuário ATIVO em toda rota de dados (RT-AB04).
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

  request.user = response.user;
  request.session = response.session;
}

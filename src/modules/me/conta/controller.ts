import type { FastifyReply, FastifyRequest } from "fastify";
import type { AccountContext, AccountService } from "./service.js";
import {
  changeEmailSchema,
  changePasswordSchema,
  emailTokenParamsSchema,
  reconfigureTwoFactorSchema,
  sessionParamsSchema,
} from "./schemas.js";

function accountContext(request: FastifyRequest): AccountContext {
  return {
    userId: request.user.id,
    sessionId: request.session.id,
    actor: {
      // Conta da equipe iEzer grava como Suporte iEzer (RT-BB12).
      type: request.team ? "SUPORTE" : "USUARIO",
      userId: request.user.id,
      ip: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    },
    headers: request.headers,
  };
}

export class AccountController {
  constructor(private readonly service: AccountService) {}

  security = async (request: FastifyRequest) => this.service.security(request.user.id);

  changePassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = changePasswordSchema.parse(request.body);
    const { cookies, result } = await this.service.changePassword(accountContext(request), input);
    // Trocar a senha encerra as outras sessões e renova a atual.
    if (cookies.length > 0) reply.header("set-cookie", cookies);
    return result;
  };

  reconfigureTwoFactor = async (request: FastifyRequest) => {
    const input = reconfigureTwoFactorSchema.parse(request.body);
    return this.service.reconfigureTwoFactor(accountContext(request), input);
  };

  listSessions = async (request: FastifyRequest) => ({
    items: await this.service.listSessions(accountContext(request)),
  });

  endSession = async (request: FastifyRequest) => {
    const { id } = sessionParamsSchema.parse(request.params);
    return this.service.endSession(accountContext(request), id);
  };

  endOtherSessions = async (request: FastifyRequest) => this.service.endOtherSessions(accountContext(request));

  myAccess = async (request: FastifyRequest) => this.service.myAccess(request.user.id);

  requestEmailChange = async (request: FastifyRequest) => {
    const input = changeEmailSchema.parse(request.body);
    return this.service.requestEmailChange(accountContext(request), input);
  };

  confirmEmailChange = async (request: FastifyRequest) => {
    const { token } = emailTokenParamsSchema.parse(request.params);
    return this.service.confirmEmailChange(token, {
      ip: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    });
  };
}

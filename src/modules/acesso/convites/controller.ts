import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext, organizationIdsWith } from "../../../lib/access.js";
import { InviteNotFoundError, type InviteContext, type InviteService } from "./service.js";
import { changeEmailSchema, createInviteSchema, inviteParamsSchema, resendInviteSchema } from "./schemas.js";

function inviteContext(request: FastifyRequest): InviteContext {
  const { churchId, actor } = getRequestContext(request);
  return { churchId, actor, organizations: request.access.organizations };
}

export class InviteController {
  constructor(private readonly service: InviteService) {}

  list = async (request: FastifyRequest) => {
    const organizationIds = organizationIdsWith(request, "acesso.usuarios.ver", "acesso.usuarios.gerenciar");
    const items = await this.service.list(getRequestContext(request).churchId, organizationIds);
    return { items };
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createInviteSchema.parse(request.body);
    const result = await this.service.create(inviteContext(request), input);
    return reply.code(201).send(result);
  };

  resend = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = inviteParamsSchema.parse(request.params);
    const { sendEmail } = resendInviteSchema.parse(request.body ?? undefined);
    return this.handleNotFound(reply, () => this.service.resend(inviteContext(request), id, sendEmail));
  };

  cancel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = inviteParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.cancel(inviteContext(request), id));
  };

  changeEmail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = inviteParamsSchema.parse(request.params);
    const input = changeEmailSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.changeEmail(inviteContext(request), id, input));
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof InviteNotFoundError) {
        return reply.notFound("Convite não encontrado.");
      }
      throw error;
    }
  }
}

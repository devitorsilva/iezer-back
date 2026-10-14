import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { SupportGrantNotFoundError, type SupportGrantService } from "./service.js";
import { approveGrantSchema, authorizeGrantSchema, grantParamsSchema, refuseGrantSchema } from "./schemas.js";

export class SupportGrantController {
  constructor(private readonly service: SupportGrantService) {}

  list = async (request: FastifyRequest) => this.service.list(getRequestContext(request).churchId);

  authorize = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = authorizeGrantSchema.parse(request.body);
    const grant = await this.service.authorize(getRequestContext(request), input);
    return reply.code(201).send(grant);
  };

  approve = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    const input = approveGrantSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => this.service.approve(getRequestContext(request), id, input));
  };

  refuse = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    const input = refuseGrantSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => this.service.refuse(getRequestContext(request), id, input));
  };

  revoke = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.revoke(getRequestContext(request), id));
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SupportGrantNotFoundError) {
        return reply.notFound("Acesso do suporte não encontrado.");
      }
      throw error;
    }
  }
}

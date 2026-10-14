import type { FastifyReply, FastifyRequest } from "fastify";
import { getChurchId, getRequestContext } from "../../../lib/access.js";
import { AccessProfileNotFoundError, AccessProfileService } from "./service.js";
import { accessProfileBodySchema, accessProfileParamsSchema, deleteAccessProfileSchema } from "./schemas.js";

export class AccessProfileController {
  constructor(private readonly service: AccessProfileService) {}

  list = async (request: FastifyRequest) => {
    const items = await this.service.list(getChurchId(request));
    return { items };
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = accessProfileBodySchema.parse(request.body);
    const profile = await this.service.create(getRequestContext(request), input);
    return reply.code(201).send(profile);
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = accessProfileParamsSchema.parse(request.params);
    const input = accessProfileBodySchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.update(getRequestContext(request), id, input));
  };

  restore = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = accessProfileParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.restore(getRequestContext(request), id));
  };

  delete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = accessProfileParamsSchema.parse(request.params);
    const input = deleteAccessProfileSchema.parse(request.body ?? undefined);
    return this.handleNotFound(reply, async () => {
      await this.service.delete(getRequestContext(request), id, input);
      return reply.code(204).send();
    });
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AccessProfileNotFoundError) {
        return reply.notFound("Perfil de acesso não encontrado.");
      }
      throw error;
    }
  }
}

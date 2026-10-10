import type { FastifyReply, FastifyRequest } from "fastify";
import { getChurchId, getRequestContext } from "../../../lib/access.js";
import { AccessProfileNotFoundError, AccessProfileService } from "./service.js";
import { accessProfileParamsSchema } from "./schemas.js";

export class AccessProfileController {
  constructor(private readonly service: AccessProfileService) {}

  list = async (request: FastifyRequest) => {
    const items = await this.service.list(getChurchId(request));
    return { items };
  };

  restore = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = accessProfileParamsSchema.parse(request.params);

    try {
      return await this.service.restore(getRequestContext(request), getChurchId(request), id);
    } catch (error) {
      if (error instanceof AccessProfileNotFoundError) {
        return reply.notFound("Perfil de acesso não encontrado.");
      }
      throw error;
    }
  };
}

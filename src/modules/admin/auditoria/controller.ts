import type { FastifyReply, FastifyRequest } from "fastify";
import { churchParamsSchema } from "../igrejas/schemas.js";
import { ChurchAdminNotFoundError } from "../igrejas/service.js";
import { churchHistoryQuerySchema, internalAuditQuerySchema } from "./schemas.js";
import type { InternalAuditService } from "./service.js";

export class InternalAuditController {
  constructor(private readonly service: InternalAuditService) {}

  list = async (request: FastifyRequest) => this.service.list(internalAuditQuerySchema.parse(request.query));

  filters = async () => this.service.filterOptions();

  churchHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const query = churchHistoryQuerySchema.parse(request.query);
    try {
      return await this.service.churchHistory(id, query);
    } catch (error) {
      if (error instanceof ChurchAdminNotFoundError) return reply.notFound("Igreja não encontrada.");
      throw error;
    }
  };
}

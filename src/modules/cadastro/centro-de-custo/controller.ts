import type { FastifyReply, FastifyRequest } from "fastify";
import {
  CostCenterConflictError,
  CostCenterNotFoundError,
  CostCenterService,
} from "./service.js";
import { costCenterParamsSchema, costCenterPayloadSchema } from "./schemas.js";

export class CostCenterController {
  constructor(private readonly service: CostCenterService) {}

  list = async () => {
    const items = await this.service.list();
    return { items };
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = costCenterParamsSchema.parse(request.params);

    try {
      return await this.service.getById(id);
    } catch (error) {
      if (error instanceof CostCenterNotFoundError) {
        return reply.notFound("Centro de custo não encontrado.");
      }

      throw error;
    }
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = costCenterPayloadSchema.parse(request.body);

    try {
      const costCenter = await this.service.create(payload);
      return reply.code(201).send(costCenter);
    } catch (error) {
      if (error instanceof CostCenterConflictError) {
        return reply.conflict("Já existe centro de custo com este nome ou código.");
      }

      throw error;
    }
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = costCenterParamsSchema.parse(request.params);
    const payload = costCenterPayloadSchema.parse(request.body);

    try {
      return await this.service.update(id, payload);
    } catch (error) {
      if (error instanceof CostCenterNotFoundError) {
        return reply.notFound("Centro de custo não encontrado.");
      }

      if (error instanceof CostCenterConflictError) {
        return reply.conflict("Já existe centro de custo com este nome ou código.");
      }

      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = costCenterParamsSchema.parse(request.params);

    try {
      await this.service.remove(id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof CostCenterNotFoundError) {
        return reply.notFound("Centro de custo não encontrado.");
      }

      throw error;
    }
  };
}

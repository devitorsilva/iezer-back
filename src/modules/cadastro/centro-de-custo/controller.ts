import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import {
  CostCenterConflictError,
  CostCenterNotFoundError,
  CostCenterService,
} from "./service.js";
import { costCenterParamsSchema, costCenterPayloadSchema } from "./schemas.js";

export class CostCenterController {
  constructor(private readonly service: CostCenterService) {}

  list = async (request: FastifyRequest) => {
    const items = await this.service.list(getRequestContext(request));
    return { items };
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = costCenterParamsSchema.parse(request.params);

    try {
      return await this.service.getById(getRequestContext(request), id);
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
      const costCenter = await this.service.create(getRequestContext(request), payload);
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
      return await this.service.update(getRequestContext(request), id, payload);
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
      await this.service.remove(getRequestContext(request), id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof CostCenterNotFoundError) {
        return reply.notFound("Centro de custo não encontrado.");
      }

      throw error;
    }
  };
}

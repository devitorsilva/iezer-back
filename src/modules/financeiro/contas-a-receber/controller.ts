import type { FastifyReply, FastifyRequest } from "fastify";
import { ReceivableNotFoundError, ReceivableService } from "./service.js";
import {
  receivableDeleteQuerySchema,
  receivableParamsSchema,
  receivablePayloadSchema,
  receivableQuerySchema,
  receivableSettlementSchema,
} from "./schemas.js";

export class ReceivableController {
  constructor(private readonly service: ReceivableService) {}

  list = async (request: FastifyRequest) => {
    const query = receivableQuerySchema.parse(request.query);
    const items = await this.service.list(query);
    return { items };
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = receivablePayloadSchema.parse(request.body);
    return reply.code(201).send(await this.service.create(payload));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = receivableParamsSchema.parse(request.params);
    const payload = receivablePayloadSchema.parse(request.body);

    try {
      return await this.service.update(id, payload);
    } catch (error) {
      if (error instanceof ReceivableNotFoundError) {
        return reply.notFound("Conta a receber não encontrada.");
      }
      throw error;
    }
  };

  settle = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = receivableParamsSchema.parse(request.params);
    const payload = receivableSettlementSchema.parse(request.body ?? {});

    try {
      return await this.service.settle(id, payload);
    } catch (error) {
      if (error instanceof ReceivableNotFoundError) {
        return reply.notFound("Conta a receber não encontrada.");
      }
      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = receivableParamsSchema.parse(request.params);
    const { scope } = receivableDeleteQuerySchema.parse(request.query);
    try {
      await this.service.remove(id, scope);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof ReceivableNotFoundError) {
        return reply.notFound("Conta a receber não encontrada.");
      }
      throw error;
    }
  };
}

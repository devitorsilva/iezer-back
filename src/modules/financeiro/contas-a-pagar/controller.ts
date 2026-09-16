import type { FastifyReply, FastifyRequest } from "fastify";
import { PayableNotFoundError, PayableService } from "./service.js";
import {
  payableDeleteQuerySchema,
  payableParamsSchema,
  payablePayloadSchema,
  payableQuerySchema,
  payableSettlementSchema,
} from "./schemas.js";

export class PayableController {
  constructor(private readonly service: PayableService) {}

  list = async (request: FastifyRequest) => {
    const query = payableQuerySchema.parse(request.query);
    const items = await this.service.list(query);
    return { items };
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = payablePayloadSchema.parse(request.body);
    return reply.code(201).send(await this.service.create(payload));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = payableParamsSchema.parse(request.params);
    const payload = payablePayloadSchema.parse(request.body);

    try {
      return await this.service.update(id, payload);
    } catch (error) {
      if (error instanceof PayableNotFoundError) {
        return reply.notFound("Conta a pagar não encontrada.");
      }
      throw error;
    }
  };

  settle = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = payableParamsSchema.parse(request.params);
    const payload = payableSettlementSchema.parse(request.body ?? {});

    try {
      return await this.service.settle(id, payload);
    } catch (error) {
      if (error instanceof PayableNotFoundError) {
        return reply.notFound("Conta a pagar não encontrada.");
      }
      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = payableParamsSchema.parse(request.params);
    const { scope } = payableDeleteQuerySchema.parse(request.query);
    try {
      await this.service.remove(id, scope);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof PayableNotFoundError) {
        return reply.notFound("Conta a pagar não encontrada.");
      }
      throw error;
    }
  };
}

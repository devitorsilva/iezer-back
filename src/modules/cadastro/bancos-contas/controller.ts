import type { FastifyReply, FastifyRequest } from "fastify";
import {
  BankAccountConflictError,
  BankAccountNotFoundError,
  BankAccountService,
} from "./service.js";
import { bankAccountParamsSchema, bankAccountPayloadSchema } from "./schemas.js";

export class BankAccountController {
  constructor(private readonly service: BankAccountService) {}

  list = async () => {
    const items = await this.service.list();
    return { items };
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = bankAccountParamsSchema.parse(request.params);

    try {
      return await this.service.getById(id);
    } catch (error) {
      if (error instanceof BankAccountNotFoundError) {
        return reply.notFound("Banco/conta não encontrado.");
      }

      throw error;
    }
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = bankAccountPayloadSchema.parse(request.body);

    try {
      const bankAccount = await this.service.create(payload);
      return reply.code(201).send(bankAccount);
    } catch (error) {
      if (error instanceof BankAccountConflictError) {
        return reply.conflict("Já existe conta com este banco e nome.");
      }

      throw error;
    }
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = bankAccountParamsSchema.parse(request.params);
    const payload = bankAccountPayloadSchema.parse(request.body);

    try {
      return await this.service.update(id, payload);
    } catch (error) {
      if (error instanceof BankAccountNotFoundError) {
        return reply.notFound("Banco/conta não encontrado.");
      }

      if (error instanceof BankAccountConflictError) {
        return reply.conflict("Já existe conta com este banco e nome.");
      }

      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = bankAccountParamsSchema.parse(request.params);

    try {
      await this.service.remove(id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof BankAccountNotFoundError) {
        return reply.notFound("Banco/conta não encontrado.");
      }

      throw error;
    }
  };
}

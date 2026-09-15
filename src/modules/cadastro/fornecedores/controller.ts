import type { FastifyReply, FastifyRequest } from "fastify";
import {
  SupplierCnpjConflictError,
  SupplierNotFoundError,
  SupplierService,
} from "./service.js";
import { supplierParamsSchema, supplierPayloadSchema } from "./schemas.js";

export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  list = async () => {
    const items = await this.service.list();
    return { items };
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = supplierParamsSchema.parse(request.params);

    try {
      return await this.service.getById(id);
    } catch (error) {
      if (error instanceof SupplierNotFoundError) {
        return reply.notFound("Fornecedor não encontrado.");
      }

      throw error;
    }
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = supplierPayloadSchema.parse(request.body);

    try {
      const supplier = await this.service.create(payload);
      return reply.code(201).send(supplier);
    } catch (error) {
      if (error instanceof SupplierCnpjConflictError) {
        return reply.conflict("Já existe fornecedor com este CNPJ.");
      }

      throw error;
    }
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = supplierParamsSchema.parse(request.params);
    const payload = supplierPayloadSchema.parse(request.body);

    try {
      return await this.service.update(id, payload);
    } catch (error) {
      if (error instanceof SupplierNotFoundError) {
        return reply.notFound("Fornecedor não encontrado.");
      }

      if (error instanceof SupplierCnpjConflictError) {
        return reply.conflict("Já existe fornecedor com este CNPJ.");
      }

      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = supplierParamsSchema.parse(request.params);

    try {
      await this.service.remove(id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof SupplierNotFoundError) {
        return reply.notFound("Fornecedor não encontrado.");
      }

      throw error;
    }
  };
}

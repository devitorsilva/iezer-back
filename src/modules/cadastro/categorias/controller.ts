import type { FastifyReply, FastifyRequest } from "fastify";
import {
  CategoryConflictError,
  CategoryNotFoundError,
  CategoryService,
} from "./service.js";
import { categoryParamsSchema, categoryPayloadSchema } from "./schemas.js";

export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  list = async () => {
    const items = await this.service.list();
    return { items };
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = categoryParamsSchema.parse(request.params);

    try {
      return await this.service.getById(id);
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        return reply.notFound("Categoria não encontrada.");
      }

      throw error;
    }
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = categoryPayloadSchema.parse(request.body);

    try {
      const category = await this.service.create(payload);
      return reply.code(201).send(category);
    } catch (error) {
      if (error instanceof CategoryConflictError) {
        return reply.conflict("Já existe categoria com este nome e tipo.");
      }

      throw error;
    }
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = categoryParamsSchema.parse(request.params);
    const payload = categoryPayloadSchema.parse(request.body);

    try {
      return await this.service.update(id, payload);
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        return reply.notFound("Categoria não encontrada.");
      }

      if (error instanceof CategoryConflictError) {
        return reply.conflict("Já existe categoria com este nome e tipo.");
      }

      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = categoryParamsSchema.parse(request.params);

    try {
      await this.service.remove(id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        return reply.notFound("Categoria não encontrada.");
      }

      throw error;
    }
  };
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { PersonNotFoundError, type PersonService } from "./service.js";
import {
  duplicateQuerySchema,
  personCreateSchema,
  personListQuerySchema,
  personParamsSchema,
  personUpdateSchema,
} from "./schemas.js";

export class PersonController {
  constructor(private readonly service: PersonService) {}

  list = async (request: FastifyRequest) => {
    const query = personListQuerySchema.parse(request.query);
    return this.service.list(getRequestContext(request), query);
  };

  duplicates = async (request: FastifyRequest) => {
    const query = duplicateQuerySchema.parse(request.query);
    return this.service.findDuplicates(getRequestContext(request), query);
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);

    try {
      return await this.service.getById(getRequestContext(request), id);
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  };

  contributions = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);

    try {
      return await this.service.contributions(getRequestContext(request), id);
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = personCreateSchema.parse(request.body);
    return reply.code(201).send(await this.service.create(getRequestContext(request), payload));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = personUpdateSchema.parse(request.body);

    try {
      return await this.service.update(getRequestContext(request), id, payload);
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);

    try {
      await this.service.remove(getRequestContext(request), id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  };
}

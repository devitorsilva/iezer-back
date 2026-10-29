import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { PersonNotFoundError } from "../pessoas/service.js";
import { RelationNotFoundError, type PersonRelationService } from "./service.js";
import { relationParamsSchema, relativeCreateSchema, relativeParamsSchema } from "./schemas.js";

export class PersonRelationController {
  constructor(private readonly service: PersonRelationService) {}

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = relativeParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.list(getRequestContext(request), id));
  };

  add = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = relativeParamsSchema.parse(request.params);
    const payload = relativeCreateSchema.parse(request.body);
    return this.handleNotFound(reply, async () =>
      reply.code(201).send(await this.service.add(getRequestContext(request), id, payload)),
    );
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, relationId } = relationParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.remove(getRequestContext(request), id, relationId));
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      if (error instanceof RelationNotFoundError) return reply.notFound("Parentesco não encontrado.");
      throw error;
    }
  }
}

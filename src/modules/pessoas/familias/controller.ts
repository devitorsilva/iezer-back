import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { FamilyMemberNotFoundError, FamilyNotFoundError, type FamilyService } from "./service.js";
import {
  familyCreateSchema,
  familyMemberParamsSchema,
  familyMemberSchema,
  familyMemberUpdateSchema,
  familyParamsSchema,
  familyUpdateSchema,
} from "./schemas.js";

export class FamilyController {
  constructor(private readonly service: FamilyService) {}

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = familyCreateSchema.parse(request.body);
    return reply.code(201).send(await this.service.create(getRequestContext(request), payload));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = familyParamsSchema.parse(request.params);
    const payload = familyUpdateSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.update(getRequestContext(request), id, payload));
  };

  addMember = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = familyParamsSchema.parse(request.params);
    const payload = familyMemberSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.addMember(getRequestContext(request), id, payload));
  };

  updateMember = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, personId } = familyMemberParamsSchema.parse(request.params);
    const payload = familyMemberUpdateSchema.parse(request.body);
    return this.handleNotFound(reply, () =>
      this.service.updateMember(getRequestContext(request), id, personId, payload),
    );
  };

  removeMember = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, personId } = familyMemberParamsSchema.parse(request.params);
    return this.handleNotFound(reply, async () => ({
      family: await this.service.removeMember(getRequestContext(request), id, personId),
    }));
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof FamilyNotFoundError) return reply.notFound("Família não encontrada.");
      if (error instanceof FamilyMemberNotFoundError) return reply.notFound("Pessoa não encontrada nesta família.");
      throw error;
    }
  }
}

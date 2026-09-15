import type { FastifyReply, FastifyRequest } from "fastify";
import {
  MemberDocumentConflictError,
  MemberNotFoundError,
  MemberService,
} from "./service.js";
import { memberParamsSchema, memberPayloadSchema } from "./schemas.js";

export class MemberController {
  constructor(private readonly service: MemberService) {}

  list = async () => {
    const items = await this.service.list();
    return { items };
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = memberParamsSchema.parse(request.params);

    try {
      return await this.service.getById(id);
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return reply.notFound("Membro não encontrado.");
      }
      throw error;
    }
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = memberPayloadSchema.parse(request.body);

    try {
      return reply.code(201).send(await this.service.create(payload));
    } catch (error) {
      if (error instanceof MemberDocumentConflictError) {
        return reply.conflict("Já existe membro com este documento.");
      }
      throw error;
    }
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = memberParamsSchema.parse(request.params);
    const payload = memberPayloadSchema.parse(request.body);

    try {
      return await this.service.update(id, payload);
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return reply.notFound("Membro não encontrado.");
      }

      if (error instanceof MemberDocumentConflictError) {
        return reply.conflict("Já existe membro com este documento.");
      }

      throw error;
    }
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = memberParamsSchema.parse(request.params);

    try {
      await this.service.remove(id);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof MemberNotFoundError) {
        return reply.notFound("Membro não encontrado.");
      }
      throw error;
    }
  };
}

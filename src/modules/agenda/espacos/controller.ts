import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { spaceParamsSchema, spacePayloadSchema } from "./schemas.js";
import { AgendaSpaceService } from "./service.js";

export class AgendaSpaceController {
  constructor(private readonly service: AgendaSpaceService) {}
  list = async (request: FastifyRequest) => ({ items: await this.service.list(getRequestContext(request)) });
  getById = async (request: FastifyRequest) => this.service.getById(getRequestContext(request), spaceParamsSchema.parse(request.params).id);
  create = async (request: FastifyRequest, reply: FastifyReply) => reply.code(201).send(await this.service.create(getRequestContext(request), spacePayloadSchema.parse(request.body)));
  update = async (request: FastifyRequest) => this.service.update(getRequestContext(request), spaceParamsSchema.parse(request.params).id, spacePayloadSchema.parse(request.body));
  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.remove(getRequestContext(request), spaceParamsSchema.parse(request.params).id);
    return result.deleted ? reply.code(204).send() : reply.send(result.space);
  };
}

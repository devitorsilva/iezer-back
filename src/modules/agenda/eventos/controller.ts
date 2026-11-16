import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { EventService } from "./service.js";
import { cancelSchema, eventDetailQuerySchema, eventListQuerySchema, eventPayloadSchema, eventUpdateSchema, idParamsSchema } from "./schemas.js";

export class EventController {
  constructor(private readonly service = new EventService()) {}

  list = async (request: FastifyRequest) => ({ items: await this.service.list(getRequestContext(request), eventListQuerySchema.parse(request.query)) });
  get = async (request: FastifyRequest) => this.service.get(
    getRequestContext(request),
    idParamsSchema.parse(request.params).id,
    eventDetailQuerySchema.parse(request.query).occurrenceId,
  );
  create = async (request: FastifyRequest, reply: FastifyReply) => reply.code(201).send(await this.service.create(getRequestContext(request), eventPayloadSchema.parse(request.body)));
  update = async (request: FastifyRequest) => this.service.update(getRequestContext(request), idParamsSchema.parse(request.params).id, eventUpdateSchema.parse(request.body));
  publish = async (request: FastifyRequest) => this.service.publish(getRequestContext(request), idParamsSchema.parse(request.params).id);
  cancel = async (request: FastifyRequest) => this.service.cancel(getRequestContext(request), idParamsSchema.parse(request.params).id, cancelSchema.parse(request.body ?? {}));
  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.removeDraft(getRequestContext(request), idParamsSchema.parse(request.params).id);
    return reply.code(204).send();
  };
}

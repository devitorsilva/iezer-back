import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { reservationParamsSchema, reservationPayloadSchema, reservationQuerySchema } from "./schemas.js";
import { AgendaReservationService } from "./service.js";

export class AgendaReservationController {
  constructor(private readonly service: AgendaReservationService) {}
  list = async (request: FastifyRequest) => ({ items: await this.service.list(getRequestContext(request), reservationQuerySchema.parse(request.query)) });
  getById = async (request: FastifyRequest) => this.service.getById(getRequestContext(request), reservationParamsSchema.parse(request.params).id);
  create = async (request: FastifyRequest, reply: FastifyReply) => reply.code(201).send(await this.service.create(getRequestContext(request), reservationPayloadSchema.parse(request.body)));
  update = async (request: FastifyRequest) => this.service.update(getRequestContext(request), reservationParamsSchema.parse(request.params).id, reservationPayloadSchema.parse(request.body));
  cancel = async (request: FastifyRequest) => this.service.cancel(getRequestContext(request), reservationParamsSchema.parse(request.params).id);
}

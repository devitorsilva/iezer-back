import type { FastifyReply, FastifyRequest } from "fastify";
import { teamActor } from "../../../lib/team.js";
import { SupportGrantNotFoundError } from "../../acesso/suporte/service.js";
import { RequestChurchNotFoundError, type SupportRequestService } from "./service.js";
import {
  closeGrantSchema,
  emergencySchema,
  grantParamsSchema,
  listRequestsQuerySchema,
  requestGrantSchema,
} from "./schemas.js";

export class SupportRequestController {
  constructor(private readonly service: SupportRequestService) {}

  list = async (request: FastifyRequest) => {
    const query = listRequestsQuerySchema.parse(request.query);
    return { items: await this.service.list(query) };
  };

  request = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = requestGrantSchema.parse(request.body);
    const context = { actor: teamActor(request), roles: request.team!.roles };
    return this.handleNotFound(reply, async () => reply.code(201).send(await this.service.request(context, input)));
  };

  emergency = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = emergencySchema.parse(request.body);
    return this.handleNotFound(reply, async () =>
      reply.code(201).send(await this.service.requestEmergency(teamActor(request), input)),
    );
  };

  approve = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.approve(teamActor(request), id));
  };

  refuse = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    const input = closeGrantSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => this.service.refuse(teamActor(request), id, input));
  };

  cancel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    const input = closeGrantSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => this.service.cancel(teamActor(request), id, input));
  };

  end = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    const input = closeGrantSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => this.service.end(teamActor(request), id, input));
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof RequestChurchNotFoundError) return reply.notFound("Igreja não encontrada.");
      if (error instanceof SupportGrantNotFoundError) return reply.notFound("Pedido de acesso não encontrado.");
      throw error;
    }
  }
}

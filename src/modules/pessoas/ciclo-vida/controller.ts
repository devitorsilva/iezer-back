import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext, organizationIdsWith } from "../../../lib/access.js";
import { PersonNotFoundError } from "../pessoas/service.js";
import { personParamsSchema } from "../pessoas/schemas.js";
import type { LifecycleService } from "./service.js";
import {
  followUpSchema,
  promoteSchema,
  statusSchema,
  statusWithReasonSchema,
  transferSchema,
} from "./schemas.js";

export class LifecycleController {
  constructor(private readonly service: LifecycleService) {}

  timeline = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.timeline(getRequestContext(request), id));
  };

  promote = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = promoteSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.promote(getRequestContext(request), id, payload));
  };

  inactivate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = statusWithReasonSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.inactivate(getRequestContext(request), id, payload));
  };

  transfer = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = transferSchema.parse(request.body);
    const organizationIds = organizationIdsWith(request, "pessoas.alterar_situacao");
    return this.handleNotFound(reply, () =>
      this.service.transfer(getRequestContext(request), id, payload, organizationIds),
    );
  };

  dismiss = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = statusWithReasonSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.dismiss(getRequestContext(request), id, payload));
  };

  registerDeath = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = statusSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.registerDeath(getRequestContext(request), id, payload));
  };

  reactivate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = statusSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.reactivate(getRequestContext(request), id, payload));
  };

  registerFollowUp = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const payload = followUpSchema.parse(request.body);

    try {
      return reply.code(201).send(await this.service.registerFollowUp(getRequestContext(request), id, payload));
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  }
}

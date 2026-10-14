import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuditActor } from "../../lib/audit.js";
import { SupportGrantNotFoundError } from "../acesso/suporte/service.js";
import { ChurchNotFoundError, type BackOfficeService } from "./service.js";
import {
  churchParamsSchema,
  churchSearchSchema,
  closeGrantSchema,
  emergencySchema,
  grantListQuerySchema,
  grantParamsSchema,
  recoverAdminSchema,
  requestGrantSchema,
} from "./schemas.js";

// Toda ação do back-office sai no log como "Suporte iEzer (nome do atendente)".
function agentActor(request: FastifyRequest): AuditActor {
  return {
    type: "SUPORTE",
    userId: request.user.id,
    ip: request.ip ?? null,
    userAgent: request.headers["user-agent"] ?? null,
  };
}

export class BackOfficeController {
  constructor(private readonly service: BackOfficeService) {}

  churches = async (request: FastifyRequest) => {
    const { busca } = churchSearchSchema.parse(request.query);
    return { items: await this.service.listChurches(busca) };
  };

  grants = async (request: FastifyRequest) => {
    const { igreja } = grantListQuerySchema.parse(request.query);
    return { items: await this.service.listGrants(igreja) };
  };

  request = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = requestGrantSchema.parse(request.body);
    return this.handleNotFound(reply, async () =>
      reply.code(201).send(await this.service.request(agentActor(request), input)),
    );
  };

  emergency = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = emergencySchema.parse(request.body);
    return this.handleNotFound(reply, async () =>
      reply.code(201).send(await this.service.requestEmergency(agentActor(request), input)),
    );
  };

  approveEmergency = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.approveEmergency(agentActor(request), id));
  };

  cancel = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    const input = closeGrantSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => this.service.cancel(agentActor(request), id, input));
  };

  end = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = grantParamsSchema.parse(request.params);
    const input = closeGrantSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => this.service.end(agentActor(request), id, input));
  };

  recoverAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const { churchId } = churchParamsSchema.parse(request.params);
    const input = recoverAdminSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.recoverAdmin(agentActor(request), churchId, input));
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ChurchNotFoundError) return reply.notFound("Igreja não encontrada.");
      if (error instanceof SupportGrantNotFoundError) return reply.notFound("Acesso do suporte não encontrado.");
      throw error;
    }
  }
}

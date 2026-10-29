import type { FastifyReply, FastifyRequest } from "fastify";
import { teamActionContext } from "../equipe/controller.js";
import { AnnouncementNotFoundError, type AnnouncementService } from "./service.js";
import { announcementInputSchema, announcementParamsSchema, listAnnouncementsQuerySchema } from "./schemas.js";

export class AnnouncementController {
  constructor(private readonly service: AnnouncementService) {}

  list = async (request: FastifyRequest) => {
    const query = listAnnouncementsQuerySchema.parse(request.query);
    const items = await this.service.list(query);
    return { items };
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = announcementParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.get(id));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = announcementInputSchema.parse(request.body);
    const result = await this.service.create(teamActionContext(request), input);
    return reply.code(201).send(result);
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = announcementParamsSchema.parse(request.params);
    const input = announcementInputSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.update(teamActionContext(request), id, input));
  };

  publish = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = announcementParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.publish(teamActionContext(request), id));
  };

  close = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = announcementParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.close(teamActionContext(request), id));
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = announcementParamsSchema.parse(request.params);
    return this.handleNotFound(reply, async () => {
      await this.service.remove(teamActionContext(request), id);
      return reply.code(204).send();
    });
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AnnouncementNotFoundError) return reply.notFound("Aviso não encontrado.");
      throw error;
    }
  }
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../lib/access.js";
import { CongregationNotFoundError, type OrganizationService } from "./service.js";
import {
  congregationParamsSchema,
  createCongregationSchema,
  lgpdOfficerSchema,
  updateChurchSchema,
  updateCongregationSchema,
} from "./schemas.js";

export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  get = async (request: FastifyRequest) => this.service.get(getRequestContext(request).churchId);

  updateChurch = async (request: FastifyRequest) =>
    this.service.updateChurch(getRequestContext(request), updateChurchSchema.parse(request.body));

  createCongregation = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createCongregationSchema.parse(request.body);
    return reply.code(201).send(await this.service.createCongregation(getRequestContext(request), input));
  };

  updateCongregation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = congregationParamsSchema.parse(request.params);
    const input = updateCongregationSchema.parse(request.body);

    try {
      return await this.service.updateCongregation(getRequestContext(request), id, input);
    } catch (error) {
      if (error instanceof CongregationNotFoundError) {
        return reply.notFound("Congregação não encontrada.");
      }
      throw error;
    }
  };

  setLgpdOfficer = async (request: FastifyRequest) =>
    this.service.setLgpdOfficer(getRequestContext(request), lgpdOfficerSchema.parse(request.body));

  removeLgpdOfficer = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.removeLgpdOfficer(getRequestContext(request));
    return reply.code(204).send();
  };

  markCongregationsReviewed = async (request: FastifyRequest) =>
    this.service.markCongregationsReviewed(getRequestContext(request));
}

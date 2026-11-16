import type { FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { OccurrenceService } from "./service.js";
import { attendanceSchema, occurrenceParamsSchema, occurrenceUpdateSchema, responseSchema, scaleSchema } from "./schemas.js";

export class OccurrenceController {
  constructor(private readonly service = new OccurrenceService()) {}
  update = async (request: FastifyRequest) => this.service.update(getRequestContext(request), occurrenceParamsSchema.parse(request.params).id, occurrenceUpdateSchema.parse(request.body));
  respond = async (request: FastifyRequest) => this.service.respond(getRequestContext(request), occurrenceParamsSchema.parse(request.params).id, responseSchema.parse(request.body));
  scale = async (request: FastifyRequest) => this.service.setScale(getRequestContext(request), occurrenceParamsSchema.parse(request.params).id, scaleSchema.parse(request.body));
  attendance = async (request: FastifyRequest) => this.service.setAttendance(getRequestContext(request), occurrenceParamsSchema.parse(request.params).id, attendanceSchema.parse(request.body));
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import { importConfirmSchema, importPreviewSchema } from "./schemas.js";
import type { ImportService } from "./service.js";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export class ImportController {
  constructor(private readonly service: ImportService) {}

  template = async (request: FastifyRequest, reply: FastifyReply) => {
    const { buffer, filename } = await this.service.template(getRequestContext(request));
    return reply
      .header("Content-Type", XLSX)
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("Access-Control-Expose-Headers", "Content-Disposition")
      .send(buffer);
  };

  preview = async (request: FastifyRequest) => {
    const payload = importPreviewSchema.parse(request.body);
    return this.service.preview(getRequestContext(request), payload);
  };

  confirm = async (request: FastifyRequest) => {
    const payload = importConfirmSchema.parse(request.body);
    return this.service.confirm(getRequestContext(request), payload);
  };
}

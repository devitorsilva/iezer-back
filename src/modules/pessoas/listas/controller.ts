import type { FastifyRequest } from "fastify";
import { getRequestContext } from "../../../lib/access.js";
import type { ChurchListService } from "./service.js";

export class ChurchListController {
  constructor(private readonly service: ChurchListService) {}

  list = async (request: FastifyRequest) => {
    const items = await this.service.list(getRequestContext(request));
    return { items };
  };
}

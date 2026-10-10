import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext, organizationIdsWith } from "../../../lib/access.js";
import { UserNotFoundError, type UserService } from "./service.js";
import { changeEmailSchema, userParamsSchema } from "./schemas.js";

export class UserController {
  constructor(private readonly service: UserService) {}

  list = async (request: FastifyRequest) => {
    const items = await this.service.list(
      organizationIdsWith(request, "acesso.usuarios.ver", "acesso.usuarios.gerenciar"),
    );
    return { items };
  };

  changeEmail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = userParamsSchema.parse(request.params);
    const input = changeEmailSchema.parse(request.body);

    try {
      return await this.service.changeEmail(
        getRequestContext(request),
        organizationIdsWith(request, "acesso.usuarios.gerenciar"),
        id,
        input,
      );
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return reply.notFound("Usuário não encontrado.");
      }
      throw error;
    }
  };
}

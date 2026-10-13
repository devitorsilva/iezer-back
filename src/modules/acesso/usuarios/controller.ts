import type { FastifyReply, FastifyRequest } from "fastify";
import { getRequestContext, organizationIdsWith } from "../../../lib/access.js";
import type { InviteService } from "../convites/service.js";
import { PersonNotFoundError, UserNotFoundError, type UserService } from "./service.js";
import { changeEmailSchema, userParamsSchema } from "./schemas.js";

export class UserController {
  constructor(
    private readonly service: UserService,
    private readonly invites: InviteService,
  ) {}

  // GET /pessoas/:id/acesso: usuário e convite pendente da pessoa.
  personAccess = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = userParamsSchema.parse(request.params);
    const context = getRequestContext(request);
    const organizationIds = organizationIdsWith(request, "acesso.usuarios.ver", "acesso.usuarios.gerenciar");

    try {
      const user = await this.service.findForPerson(context.readOrganizationIds, organizationIds, id);
      const invite = user ? null : await this.invites.findForPerson(context.churchId, organizationIds, id);
      return { user, invite };
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  };

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

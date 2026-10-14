import type { FastifyReply, FastifyRequest } from "fastify";
import { teamActor } from "../../../lib/team.js";
import { TeamNotFoundError, type TeamActionContext, type TeamService } from "./service.js";
import { changeTeamRolesSchema, createTeamInviteSchema, resendTeamInviteSchema, teamParamsSchema } from "./schemas.js";

export function teamActionContext(request: FastifyRequest): TeamActionContext {
  return { actor: teamActor(request), userId: request.user.id, userName: request.user.name };
}

export class TeamController {
  constructor(private readonly service: TeamService) {}

  list = async () => {
    const items = await this.service.list();
    return { items };
  };

  invite = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createTeamInviteSchema.parse(request.body);
    const result = await this.service.invite(teamActionContext(request), input);
    return reply.code(201).send(result);
  };

  resendInvite = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = teamParamsSchema.parse(request.params);
    const { sendEmail } = resendTeamInviteSchema.parse(request.body ?? undefined);
    return this.handleNotFound(reply, () => this.service.resendInvite(teamActionContext(request), id, sendEmail));
  };

  cancelInvite = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = teamParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.cancelInvite(teamActionContext(request), id));
  };

  changeRoles = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = teamParamsSchema.parse(request.params);
    const { roles } = changeTeamRolesSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.changeRoles(teamActionContext(request), id, roles));
  };

  deactivate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = teamParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.deactivate(teamActionContext(request), id));
  };

  reactivate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = teamParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.reactivate(teamActionContext(request), id));
  };

  resetAuthenticator = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = teamParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.resetAuthenticator(teamActionContext(request), id));
  };

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof TeamNotFoundError) {
        return reply.notFound(error.target === "invite" ? "Convite não encontrado." : "Membro da equipe não encontrado.");
      }
      throw error;
    }
  }
}

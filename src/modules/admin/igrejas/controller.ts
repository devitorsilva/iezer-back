import type { FastifyReply, FastifyRequest } from "fastify";
import { teamActor } from "../../../lib/team.js";
import { CongregationNotFoundError, type OrganizationService } from "../../organizacao/service.js";
import {
  accountOwnerContactSchema,
  createCongregationSchema,
  lgpdOfficerSchema,
  updateChurchSchema,
  updateCongregationSchema,
} from "../../organizacao/schemas.js";
import { recoverAdmin, resetAdminTwoFactor, unlockLogin } from "./acoes.js";
import { createChurch } from "./criacao.js";
import { changeAccountOwner, listAccountOwnerChanges, openAccountDocument } from "./responsavel.js";
import {
  activateChurchSchema,
  changeAccountOwnerSchema,
  churchParamsSchema,
  churchStatusReasonSchema,
  congregationParamsSchema,
  createChurchSchema,
  documentParamsSchema,
  inviteParamsSchema,
  listChurchesQuerySchema,
  recoverAdminSchema,
  resetTwoFactorSchema,
  teamActionSchema,
  userParamsSchema,
} from "./schemas.js";
import { ChurchAdminNotFoundError, type ChurchAdminService } from "./service.js";
import { changeChurchStatus } from "./situacao.js";

const NOT_FOUND_MESSAGES = {
  church: "Igreja não encontrada.",
  congregation: "Congregação não encontrada.",
  invite: "Convite não encontrado.",
  document: "Documento não encontrado.",
  user: "Usuário não encontrado nesta igreja.",
} as const;

// Edições da sede, das congregações e dos contatos reaproveitam o serviço de Configurações ›
// Organização, com a equipe como autor ("Suporte iEzer" na Auditoria da igreja).
export class ChurchAdminController {
  constructor(
    private readonly service: ChurchAdminService,
    private readonly organizations: OrganizationService,
  ) {}

  list = async (request: FastifyRequest) => {
    const items = await this.service.list(listChurchesQuerySchema.parse(request.query));
    return { items };
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = createChurchSchema.parse(request.body);
    return reply.code(201).send(await createChurch(teamActor(request), input));
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => this.service.get(id));
  };

  users = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    return this.handleNotFound(reply, async () => ({ items: await this.service.listUsers(id) }));
  };

  updateChurch = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const input = updateChurchSchema.parse(request.body);
    return this.handleNotFound(reply, async () => {
      await this.service.assertChurch(id);
      return this.organizations.updateChurch(this.context(request, id), input);
    });
  };

  createCongregation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const input = createCongregationSchema.parse(request.body);
    return this.handleNotFound(reply, async () => {
      await this.service.assertChurch(id);
      return reply.code(201).send(await this.organizations.createCongregation(this.context(request, id), input));
    });
  };

  updateCongregation = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, congregationId } = congregationParamsSchema.parse(request.params);
    const input = updateCongregationSchema.parse(request.body);
    return this.handleNotFound(reply, () =>
      this.organizations.updateCongregation(this.context(request, id), congregationId, input),
    );
  };

  setAccountOwnerContact = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const input = accountOwnerContactSchema.parse(request.body);
    return this.handleNotFound(reply, async () => {
      await this.service.assertChurch(id);
      return this.organizations.setAccountOwnerContact(this.context(request, id), input);
    });
  };

  setLgpdOfficer = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const input = lgpdOfficerSchema.parse(request.body);
    return this.handleNotFound(reply, async () => {
      await this.service.assertChurch(id);
      return this.organizations.setLgpdOfficer(this.context(request, id), input);
    });
  };

  removeLgpdOfficer = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    return this.handleNotFound(reply, async () => {
      await this.service.assertChurch(id);
      await this.organizations.removeLgpdOfficer(this.context(request, id));
      return reply.code(204).send();
    });
  };

  resendInvite = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, inviteId } = inviteParamsSchema.parse(request.params);
    const input = teamActionSchema.parse(request.body);
    return this.handleNotFound(reply, () => this.service.resendAdminInvite(teamActor(request), id, inviteId, input));
  };

  resetTwoFactor = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, userId } = userParamsSchema.parse(request.params);
    const input = resetTwoFactorSchema.parse(request.body);
    return this.handleNotFound(reply, () => resetAdminTwoFactor(teamActor(request), id, userId, input));
  };

  unlockLogin = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, userId } = userParamsSchema.parse(request.params);
    const input = teamActionSchema.parse(request.body);
    return this.handleNotFound(reply, () => unlockLogin(teamActor(request), id, userId, input));
  };

  recoverAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const input = recoverAdminSchema.parse(request.body);
    return this.handleNotFound(reply, () => recoverAdmin(teamActor(request), id, input));
  };

  activate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const { reason } = activateChurchSchema.parse(request.body ?? {});
    return this.handleNotFound(reply, () => changeChurchStatus(teamActor(request), id, "ativar", reason ?? null));
  };

  suspend = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const { reason } = churchStatusReasonSchema.parse(request.body);
    return this.handleNotFound(reply, () => changeChurchStatus(teamActor(request), id, "suspender", reason));
  };

  reactivate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const { reason } = churchStatusReasonSchema.parse(request.body);
    return this.handleNotFound(reply, () => changeChurchStatus(teamActor(request), id, "reativar", reason));
  };

  changeAccountOwner = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    const input = changeAccountOwnerSchema.parse(request.body);
    return this.handleNotFound(reply, async () =>
      reply.code(201).send(await changeAccountOwner(teamActor(request), id, input)),
    );
  };

  accountOwnerHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = churchParamsSchema.parse(request.params);
    return this.handleNotFound(reply, async () => {
      await this.service.assertChurch(id);
      return { items: await listAccountOwnerChanges(id) };
    });
  };

  documentLink = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, documentId } = documentParamsSchema.parse(request.params);
    return this.handleNotFound(reply, () => openAccountDocument(teamActor(request), id, documentId));
  };

  private context(request: FastifyRequest, churchId: string) {
    return { churchId, actor: teamActor(request) };
  }

  private async handleNotFound<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ChurchAdminNotFoundError) return reply.notFound(NOT_FOUND_MESSAGES[error.target]);
      if (error instanceof CongregationNotFoundError) return reply.notFound(NOT_FOUND_MESSAGES.congregation);
      throw error;
    }
  }
}

import type { OrganizationContact } from "@prisma/client";
import type { AuditActor } from "../../../lib/audit.js";
import { teamActionNotice } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { inviteService } from "../../acesso/convites/routes.js";
import type {
  ChurchAdminRepository,
  ChurchDetailRow,
  ChurchInviteRow,
  ChurchListRow,
  ChurchUsage,
  ChurchUserRow,
} from "./repository.js";
import type { ListChurchesQuery, TeamActionInput } from "./schemas.js";

export class ChurchAdminNotFoundError extends Error {
  constructor(readonly target: "church" | "congregation" | "invite") {
    super("CHURCH_ADMIN_NOT_FOUND");
  }
}

const NO_USAGE: ChurchUsage = { activeUsers: 0, lastUsedAt: null };

function mapContact(contact: OrganizationContact | undefined) {
  if (!contact) return null;
  return { name: contact.name, jobTitle: contact.jobTitle, email: contact.email, phone: contact.phone };
}

function mapListItem(church: ChurchListRow, usage: ChurchUsage) {
  return {
    id: church.id,
    name: church.name,
    cnpj: church.cnpj,
    status: church.status,
    statusChangedAt: church.statusChangedAt.toISOString(),
    congregations: church._count.children,
    accountOwner: church.contacts[0] ?? null,
    activeUsers: usage.activeUsers,
    lastUsedAt: usage.lastUsedAt?.toISOString() ?? null,
    createdAt: church.createdAt.toISOString(),
  };
}

function mapDetail(church: ChurchDetailRow, usage: ChurchUsage, people: number) {
  return {
    id: church.id,
    name: church.name,
    cnpj: church.cnpj,
    status: church.status,
    statusChangedAt: church.statusChangedAt.toISOString(),
    statusReason: church.statusReason,
    createdAt: church.createdAt.toISOString(),
    accountOwner: mapContact(church.contacts.find((contact) => contact.role === "RESPONSAVEL_CONTA")),
    lgpdOfficer: mapContact(church.contacts.find((contact) => contact.role === "ENCARREGADO_LGPD")),
    congregations: church.children.map((congregation) => ({
      id: congregation.id,
      name: congregation.name,
      isActive: congregation.isActive,
      createdAt: congregation.createdAt.toISOString(),
    })),
    // Contadores agregados (B8): nenhum dado de pessoa.
    counters: { people, activeUsers: usage.activeUsers, lastUsedAt: usage.lastUsedAt?.toISOString() ?? null },
  };
}

type AssignmentRow = ChurchUserRow["assignments"][number] | ChurchInviteRow["assignments"][number];

// Perfis agrupados por organização, sede primeiro.
function groupAssignments(assignments: AssignmentRow[]) {
  const groups = new Map<string, { organizationId: string; organizationName: string; isSede: boolean; profiles: string[] }>();

  for (const { organization, profile } of assignments) {
    const group = groups.get(organization.id) ?? {
      organizationId: organization.id,
      organizationName: organization.name,
      isSede: organization.type === "SEDE",
      profiles: [],
    };
    group.profiles.push(profile.name);
    groups.set(organization.id, group);
  }

  return [...groups.values()]
    .sort((a, b) => Number(b.isSede) - Number(a.isSede) || a.organizationName.localeCompare(b.organizationName, "pt-BR"))
    .map(({ isSede: _isSede, ...group }) => group);
}

// Convite de admin: algum perfil com "Gerenciar perfis de acesso" (a mesma regra das travas).
const isAdminInvite = (invite: ChurchInviteRow) =>
  invite.assignments.some(({ profile }) => profile.permissions.length > 0);

function mapUser(user: ChurchUserRow) {
  return {
    kind: "USUARIO" as const,
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    organizations: groupAssignments(user.assignments),
    inviteExpiresAt: null,
    isAdminInvite: false,
  };
}

function mapInvite(invite: ChurchInviteRow) {
  return {
    kind: "CONVITE" as const,
    id: invite.id,
    name: invite.person.name,
    email: invite.email,
    status: invite.expiresAt <= new Date() ? ("CONVITE_EXPIRADO" as const) : ("CONVIDADO" as const),
    lastLoginAt: null,
    organizations: groupAssignments(invite.assignments),
    inviteExpiresAt: invite.expiresAt.toISOString(),
    isAdminInvite: isAdminInvite(invite),
  };
}

// Igrejas no back-office (RF-BO11, RF-BO15 a RF-BO18, RF-BO29). Só cadastro, contatos, usuários e
// contadores (B8, RF-BO56).
export class ChurchAdminService {
  constructor(private readonly repository: ChurchAdminRepository) {}

  async list(query: ListChurchesQuery) {
    const churches = await this.repository.list({ search: query.busca, status: query.situacao });
    const usage = await this.repository.usage(churches.map((church) => church.id));
    return churches.map((church) => mapListItem(church, usage.get(church.id) ?? NO_USAGE));
  }

  async get(id: string) {
    const church = await this.repository.findChurch(id);
    if (!church) throw new ChurchAdminNotFoundError("church");

    const [usage, people] = await Promise.all([this.repository.usage([id]), this.repository.countPeople(id)]);
    return mapDetail(church, usage.get(id) ?? NO_USAGE, people);
  }

  async assertChurch(id: string) {
    if (!(await this.repository.churchExists(id))) throw new ChurchAdminNotFoundError("church");
  }

  // Aba Usuários (RF-BO18): usuários e convites pendentes, sem link para a Pessoa.
  async listUsers(id: string) {
    await this.assertChurch(id);
    const [users, invites] = await Promise.all([this.repository.findUsers(id), this.repository.findPendingInvites(id)]);
    return [...invites.map(mapInvite), ...users.map(mapUser)];
  }

  // Reenviar o convite de um admin (RF-BO29, RF-BO32): novo link por e-mail ao convidado, motivo no
  // log da igreja como "Suporte iEzer" e aviso ao responsável pela conta. O link não volta para a
  // equipe.
  async resendAdminInvite(actor: AuditActor, churchId: string, inviteId: string, input: TeamActionInput) {
    const church = await this.repository.findChurch(churchId);
    if (!church) throw new ChurchAdminNotFoundError("church");

    const invite = await this.repository.findInvite(inviteId, churchId);
    if (!invite) throw new ChurchAdminNotFoundError("invite");
    if (!isAdminInvite(invite)) {
      throw new AppError(
        409,
        "NOT_ADMIN_INVITE",
        "O back-office só reenvia convites de administrador. Os demais são reenviados pela igreja.",
      );
    }

    const description = [`Motivo: ${input.reason}`, input.ticket ? `Chamado: ${input.ticket}` : null]
      .filter(Boolean)
      .join(" · ");

    const result = await inviteService.resend({ churchId, actor, organizations: null }, inviteId, true, {
      action: "suporte_reenviar_convite",
      description,
    });

    const owner = church.contacts.find((contact) => contact.role === "RESPONSAVEL_CONTA");
    const agent = actor.userId
      ? await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } })
      : null;
    const ownerNotified = owner
      ? await trySendMail(
          teamActionNotice({
            to: owner.email,
            name: owner.name,
            churchName: church.name,
            agentName: agent?.name ?? "Suporte iEzer",
            action: `reenviou o convite de administrador(a) de ${invite.person.name} (${invite.email})`,
            reason: input.reason,
            ticket: input.ticket ?? null,
          }),
        )
      : false;

    return {
      email: result.invite.email,
      expiresAt: result.invite.expiresAt,
      emailSent: result.emailSent,
      ownerNotified,
    };
  }
}

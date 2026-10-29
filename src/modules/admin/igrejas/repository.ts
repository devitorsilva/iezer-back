import { Prisma, type EmailEventType, type OrganizationStatus } from "@prisma/client";
import { normalizeAnyCnpj } from "../../../lib/cnpj.js";
import { prisma } from "../../../lib/prisma.js";
import { ADMIN_PERMISSION } from "../../acesso/travas.js";

const CHURCH_LIST_LIMIT = 500;

const listSelect = {
  id: true,
  name: true,
  cnpj: true,
  status: true,
  statusChangedAt: true,
  createdAt: true,
  contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } },
  _count: { select: { children: { where: { isActive: true } } } },
} satisfies Prisma.OrganizationSelect;

const detailInclude = {
  contacts: true,
  children: { orderBy: { name: "asc" } },
} satisfies Prisma.OrganizationInclude;

export type ChurchListRow = Prisma.OrganizationGetPayload<{ select: typeof listSelect }>;
export type ChurchDetailRow = Prisma.OrganizationGetPayload<{ include: typeof detailInclude }>;

// Só o que a B8 permite: nome, e-mail, status, último acesso e perfis por organização.
const userSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  lastLoginAt: true,
  twoFactorEnabled: true,
  assignments: {
    select: {
      organization: { select: { id: true, name: true, type: true } },
      profile: {
        select: {
          id: true,
          name: true,
          permissions: { where: { permissionKey: ADMIN_PERMISSION }, select: { permissionKey: true } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

const inviteSelect = {
  id: true,
  email: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  person: { select: { name: true } },
  assignments: {
    select: {
      organization: { select: { id: true, name: true, type: true } },
      profile: {
        select: {
          id: true,
          name: true,
          permissions: { where: { permissionKey: ADMIN_PERMISSION }, select: { permissionKey: true } },
        },
      },
    },
  },
} satisfies Prisma.InviteSelect;

export type ChurchUserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
export type ChurchInviteRow = Prisma.InviteGetPayload<{ select: typeof inviteSelect }>;

export interface EmailRejection {
  type: EmailEventType;
  occurredAt: Date;
}

export interface ChurchUsage {
  activeUsers: number;
  lastUsedAt: Date | null;
}

// Organizações da igreja: a sede e as congregações.
const inChurch = (churchId: string) => ({ OR: [{ id: churchId }, { parentId: churchId }] });

// Igrejas para a equipe iEzer (RF-BO11, RF-BO16, RF-BO18). Nunca lê dados de pessoa além da
// contagem (B8).
export class ChurchAdminRepository {
  list(filters: { search?: string | null; status?: OrganizationStatus | null }) {
    const search = filters.search?.trim();
    const cnpj = search ? normalizeAnyCnpj(search) : "";

    return prisma.organization.findMany({
      where: {
        type: "SEDE",
        parentId: null,
        status: filters.status ?? undefined,
        OR: search
          ? [
              { name: { contains: search, mode: "insensitive" } },
              ...(cnpj.length >= 3 ? [{ cnpj: { contains: cnpj } }] : []),
            ]
          : undefined,
      },
      orderBy: { name: "asc" },
      take: CHURCH_LIST_LIMIT,
      select: listSelect,
    });
  }

  findChurch(id: string) {
    return prisma.organization.findFirst({ where: { id, type: "SEDE", parentId: null }, include: detailInclude });
  }

  async churchExists(id: string) {
    return (await prisma.organization.count({ where: { id, type: "SEDE", parentId: null } })) > 0;
  }

  // Usuários ativos e último login por igreja, numa consulta agregada.
  async usage(churchIds: string[]): Promise<Map<string, ChurchUsage>> {
    if (churchIds.length === 0) return new Map();

    const rows = await prisma.$queryRaw<{ churchId: string; activeUsers: number; lastUsedAt: Date | null }[]>`
      SELECT COALESCE(o."parentId", o."id") AS "churchId",
             COUNT(DISTINCT u."id") FILTER (WHERE u."status" = 'ATIVO')::int AS "activeUsers",
             MAX(u."lastLoginAt") AS "lastUsedAt"
      FROM "UserAssignment" a
      JOIN "Organization" o ON o."id" = a."organizationId"
      JOIN "User" u ON u."id" = a."userId"
      WHERE COALESCE(o."parentId", o."id") IN (${Prisma.join(churchIds)})
      GROUP BY 1`;

    return new Map(rows.map((row) => [row.churchId, { activeUsers: row.activeUsers, lastUsedAt: row.lastUsedAt }]));
  }

  countPeople(churchId: string) {
    return prisma.person.count({ where: { organization: inChurch(churchId) } });
  }

  findUsers(churchId: string) {
    return prisma.user.findMany({
      where: { assignments: { some: { organization: inChurch(churchId) } } },
      orderBy: { name: "asc" },
      select: userSelect,
    });
  }

  findPendingInvites(churchId: string) {
    return prisma.invite.findMany({
      where: { churchId, status: "PENDENTE" },
      orderBy: { createdAt: "desc" },
      select: inviteSelect,
    });
  }

  // Bloqueios vigentes do login, pelo e-mail em minúsculas (login-lock.ts).
  async findLoginLocks(emails: string[]) {
    const locks = await prisma.loginLock.findMany({
      where: { email: { in: emails.map((email) => email.toLowerCase()) }, lockedUntil: { gt: new Date() } },
      select: { email: true, lockedUntil: true },
    });
    return new Map(locks.map((lock) => [lock.email, lock.lockedUntil!]));
  }

  // Último e-mail rejeitado ou marcado como spam de cada endereço (EmailEvent guarda em minúsculas).
  async findEmailRejections(emails: string[]): Promise<Map<string, EmailRejection>> {
    if (emails.length === 0) return new Map();

    const events = await prisma.emailEvent.findMany({
      where: { email: { in: emails.map((email) => email.toLowerCase()) } },
      orderBy: { occurredAt: "desc" },
      distinct: ["email"],
      select: { email: true, type: true, occurredAt: true },
    });
    return new Map(events.map((event) => [event.email, event]));
  }

  findInvite(id: string, churchId: string) {
    return prisma.invite.findFirst({ where: { id, churchId }, select: inviteSelect });
  }
}

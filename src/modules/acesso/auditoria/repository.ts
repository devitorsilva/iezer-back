import type { ModuleKey, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { AuditFilters } from "./schemas.js";

// Brasil sem horário de verão desde 2019: o dia civil da igreja começa às 03:00 UTC.
const dayStart = (date: string) => new Date(`${date}T00:00:00.000-03:00`);
const nextDayStart = (date: string) => new Date(dayStart(date).getTime() + 24 * 60 * 60 * 1000);

const select = {
  id: true,
  createdAt: true,
  actorType: true,
  actorUserId: true,
  actorUser: { select: { name: true } },
  organization: { select: { id: true, name: true } },
  module: true,
  action: true,
  description: true,
  targetType: true,
  targetId: true,
  before: true,
  after: true,
  ip: true,
  userAgent: true,
  personIds: true,
} satisfies Prisma.AuditLogSelect;

export type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof select }>;

export interface AuditScope {
  organizationIds: string[];
  // Aba Histórico: só um módulo.
  module?: ModuleKey;
}

// Nome do registro alvo por tipo (o log minimizado nem sempre traz o nome).
const TARGET_NAME_LOOKUPS: Record<string, (ids: string[]) => Promise<{ id: string; label: string }[]>> = {
  Person: (ids) => named(prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  User: (ids) => named(prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  AccessProfile: (ids) =>
    named(prisma.accessProfile.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  Family: (ids) => named(prisma.family.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  Organization: (ids) =>
    named(prisma.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  OrganizationContact: (ids) =>
    named(prisma.organizationContact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  Supplier: (ids) => named(prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  Category: (ids) => named(prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  CostCenter: (ids) =>
    named(prisma.costCenter.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  BankAccount: async (ids) =>
    (await prisma.bankAccount.findMany({ where: { id: { in: ids } }, select: { id: true, accountName: true } })).map(
      (item) => ({ id: item.id, label: item.accountName }),
    ),
  Payable: async (ids) =>
    (await prisma.payable.findMany({ where: { id: { in: ids } }, select: { id: true, description: true } })).map(
      (item) => ({ id: item.id, label: item.description }),
    ),
  Receivable: async (ids) =>
    (await prisma.receivable.findMany({ where: { id: { in: ids } }, select: { id: true, description: true } })).map(
      (item) => ({ id: item.id, label: item.description }),
    ),
  FollowUp: async (ids) =>
    (
      await prisma.followUp.findMany({ where: { id: { in: ids } }, select: { id: true, person: { select: { name: true } } } })
    ).map((item) => ({ id: item.id, label: item.person.name })),
  Invite: async (ids) =>
    (await prisma.invite.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })).map((item) => ({
      id: item.id,
      label: item.email,
    })),
};

async function named(query: Promise<{ id: string; name: string }[]>) {
  return (await query).map((item) => ({ id: item.id, label: item.name }));
}

export class AuditRepository {
  private where(scope: AuditScope, filters: AuditFilters): Prisma.AuditLogWhereInput {
    const organizationIds = filters.organizacao
      ? scope.organizationIds.filter((id) => id === filters.organizacao)
      : scope.organizationIds;

    return {
      organizationId: { in: organizationIds },
      module: scope.module ?? filters.modulo,
      action: filters.acao,
      actorUserId: filters.autor,
      actorType: filters.suporte ? "SUPORTE" : undefined,
      personIds: filters.pessoa ? { has: filters.pessoa } : undefined,
      createdAt:
        filters.de || filters.ate
          ? {
              gte: filters.de ? dayStart(filters.de) : undefined,
              lt: filters.ate ? nextDayStart(filters.ate) : undefined,
            }
          : undefined,
    };
  }

  async list(scope: AuditScope, filters: AuditFilters, page: number, pageSize: number) {
    const where = this.where(scope, filters);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }

  // Exportação: até `limit` linhas; uma a mais indica que ficou de fora.
  findForExport(scope: AuditScope, filters: AuditFilters, limit: number) {
    return prisma.auditLog.findMany({
      where: this.where(scope, filters),
      select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
  }

  async targetLabels(rows: AuditRow[]) {
    const idsByType = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.targetType || !row.targetId || !TARGET_NAME_LOOKUPS[row.targetType]) continue;
      const ids = idsByType.get(row.targetType) ?? new Set<string>();
      ids.add(row.targetId);
      idsByType.set(row.targetType, ids);
    }

    const labels = new Map<string, string>();
    await Promise.all(
      [...idsByType].map(async ([type, ids]) => {
        for (const item of await TARGET_NAME_LOOKUPS[type]([...ids])) labels.set(`${type}:${item.id}`, item.label);
      }),
    );
    return labels;
  }

  async personNames(ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const people = await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(people.map((person) => [person.id, person.name]));
  }

  // Organizações da igreja, inclusive desativadas: o log delas continua consultável.
  async churchOrganizations(churchId: string) {
    return prisma.organization.findMany({
      where: { OR: [{ id: churchId }, { parentId: churchId }] },
      select: { id: true, name: true, type: true, isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async personExists(personId: string, organizationIds: string[]) {
    const count = await prisma.person.count({ where: { id: personId, organizationId: { in: organizationIds } } });
    return count > 0;
  }

  // Opções dos filtros: só o que existe no log das organizações.
  async filterOptions(organizationIds: string[]) {
    const where = { organizationId: { in: organizationIds } };
    const [actions, actors] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["module", "action"], where }),
      prisma.auditLog.groupBy({ by: ["actorUserId"], where: { ...where, actorUserId: { not: null } } }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: actors.map((actor) => actor.actorUserId!) } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    return { actions, users };
  }
}

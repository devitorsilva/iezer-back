import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { auditRowSelect, periodWhere } from "../../acesso/auditoria/repository.js";

// Auditoria interna (RF-BO51, RT-BB12): tudo o que tem a equipe como autor (logins, equipe, ações
// nas igrejas e no modo suporte) e o que o back-office faz sem igreja (e-mail dos avisos).
const INTERNAL_WHERE: Prisma.AuditLogWhereInput = {
  OR: [{ actorType: "SUPORTE" }, { organizationId: null, module: "BACKOFFICE" }],
};

export interface InternalAuditFilters {
  organizationIds?: string[];
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
}

export class InternalAuditRepository {
  churchOrganizationIds(churchId: string) {
    return prisma.organization
      .findMany({ where: { OR: [{ id: churchId }, { parentId: churchId }] }, select: { id: true } })
      .then((orgs) => orgs.map((org) => org.id));
  }

  churchExists(churchId: string) {
    return prisma.organization.count({ where: { id: churchId, type: "SEDE", parentId: null } }).then((count) => count > 0);
  }

  // Interna: escopo da equipe. Histórico da igreja: equipe e sistema (exportação) nas organizações dela.
  where(scope: "interna" | "igreja", filters: InternalAuditFilters): Prisma.AuditLogWhereInput {
    return {
      AND: [
        scope === "interna" ? INTERNAL_WHERE : { actorType: { in: ["SUPORTE", "SISTEMA"] } },
        {
          organizationId: filters.organizationIds ? { in: filters.organizationIds } : undefined,
          actorUserId: filters.actorUserId,
          action: filters.action,
          createdAt: periodWhere(filters.from, filters.to),
        },
      ],
    };
  }

  async list(where: Prisma.AuditLogWhereInput, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: auditRowSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }

  // Opções dos filtros: membros da equipe (inclusive desativados), igrejas e ações já registradas.
  async filterOptions(where: Prisma.AuditLogWhereInput) {
    const [members, churches, actions] = await Promise.all([
      prisma.teamMember.findMany({
        select: { user: { select: { id: true, name: true, email: true, status: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      prisma.organization.findMany({
        where: { type: "SEDE", parentId: null },
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
      prisma.auditLog.groupBy({ by: ["action"], where }),
    ]);
    return { members: members.map((member) => member.user), churches, actions: actions.map((item) => item.action) };
  }
}

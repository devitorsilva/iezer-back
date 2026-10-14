import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { activeGrantWhere } from "../../../lib/support.js";

type Db = Prisma.TransactionClient;

const person = { select: { id: true, name: true, isSupportAgent: true } } as const;

const select = {
  id: true,
  origin: true,
  status: true,
  emergencyKind: true,
  ticket: true,
  reason: true,
  scope: true,
  canWrite: true,
  writeJustification: true,
  durationHours: true,
  requestedAt: true,
  approvedAt: true,
  startsAt: true,
  expiresAt: true,
  closedAt: true,
  closeReason: true,
  church: { select: { id: true, name: true } },
  requestedBy: person,
  approvedBy: person,
  closedBy: person,
} satisfies Prisma.SupportGrantSelect;

export type SupportGrantRow = Prisma.SupportGrantGetPayload<{ select: typeof select }>;

const HISTORY_LIMIT = 100;
const BACK_OFFICE_LIMIT = 200;

export class SupportGrantRepository {
  findForChurch(churchId: string): Promise<SupportGrantRow[]> {
    return prisma.supportGrant.findMany({
      where: { churchId },
      select,
      orderBy: { requestedAt: "desc" },
      take: HISTORY_LIMIT,
    });
  }

  // Back-office: todas as igrejas, ou uma só.
  findAll(churchId?: string): Promise<SupportGrantRow[]> {
    return prisma.supportGrant.findMany({
      where: { churchId },
      select,
      orderBy: { requestedAt: "desc" },
      take: BACK_OFFICE_LIMIT,
    });
  }

  // Sem churchId: back-office, qualquer igreja.
  findById(id: string, churchId: string | null, db: Db = prisma): Promise<SupportGrantRow | null> {
    return db.supportGrant.findFirst({ where: { id, churchId: churchId ?? undefined }, select });
  }

  findActive(churchId: string, db: Db = prisma): Promise<SupportGrantRow | null> {
    return db.supportGrant.findFirst({
      where: { churchId, ...activeGrantWhere() },
      select,
      orderBy: { expiresAt: "desc" },
    });
  }

  create(data: Prisma.SupportGrantUncheckedCreateInput, db: Db = prisma): Promise<SupportGrantRow> {
    return db.supportGrant.create({ data, select });
  }

  // Muda o status só se ainda estiver como lido: duas decisões ao mesmo tempo não passam as duas.
  async transition(
    id: string,
    from: SupportGrantRow["status"],
    data: Prisma.SupportGrantUncheckedUpdateInput,
    db: Db = prisma,
  ): Promise<SupportGrantRow | null> {
    const { count } = await db.supportGrant.updateMany({ where: { id, status: from }, data });
    return count ? this.findById(id, null, db) : null;
  }
}

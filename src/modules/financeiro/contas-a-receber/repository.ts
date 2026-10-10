import { Prisma, type Receivable } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { ReceivablePayload, ReceivableQuery, ReceivableSettlementPayload } from "./schemas.js";

const include = { category: true, person: true, settlementBankAccount: true } satisfies Prisma.ReceivableInclude;

export type ReceivableCreatePayload = ReceivablePayload & {
  recurrenceGroupId?: string;
};

// A API mantém `memberId` até o PersonPicker (Sprint 5); no banco a coluna é `personId`.
function mapPayload({ memberId, ...payload }: ReceivableCreatePayload) {
  return {
    ...payload,
    personId: memberId,
    amount: new Prisma.Decimal(payload.amount),
  };
}

type Db = Prisma.TransactionClient;

function buildWhere(organizationIds: string[], query: ReceivableQuery): Prisma.ReceivableWhereInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    organizationId: { in: organizationIds },
    ...(query.overdue ? { status: { not: "RECEBIDO" }, dueDate: { lt: today } } : {}),
    ...(!query.overdue && query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q
      ? {
          OR: [
            { description: { contains: query.q, mode: "insensitive" } },
            { source: { contains: query.q, mode: "insensitive" } },
            { person: { name: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
    ...(!query.overdue && (query.dueFrom || query.dueTo)
      ? {
          dueDate: {
            ...(query.dueFrom ? { gte: query.dueFrom } : {}),
            ...(query.dueTo ? { lte: query.dueTo } : {}),
          },
        }
      : {}),
  };
}

export type ReceivableWithCategory = Receivable & {
  category: { id: string; name: string } | null;
  person: { id: string; name: string } | null;
  settlementBankAccount: { id: string; accountName: string; bankName: string } | null;
};

export class ReceivableRepository {
  findAll(organizationIds: string[], query: ReceivableQuery): Promise<ReceivableWithCategory[]> {
    return prisma.receivable.findMany({
      where: buildWhere(organizationIds, query),
      include,
      orderBy: [{ dueDate: "asc" }, { description: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<ReceivableWithCategory | null> {
    return db.receivable.findFirst({ where: { id, organizationId: { in: organizationIds } }, include });
  }

  findByRecurrenceGroupId(recurrenceGroupId: string, organizationId: string, db: Db = prisma) {
    return db.receivable.findMany({ where: { recurrenceGroupId, organizationId }, include });
  }

  create(payload: ReceivableCreatePayload, organizationId: string, db: Db = prisma): Promise<ReceivableWithCategory> {
    return db.receivable.create({ data: { ...mapPayload(payload), organizationId }, include });
  }

  async createMany(
    payloads: ReceivableCreatePayload[],
    organizationId: string,
    db: Db = prisma,
  ): Promise<ReceivableWithCategory[]> {
    const created = await db.receivable.createManyAndReturn({
      data: payloads.map((payload) => ({ ...mapPayload(payload), organizationId })),
      select: { id: true },
    });

    return db.receivable.findMany({
      where: { id: { in: created.map(({ id }) => id) } },
      include,
      orderBy: { dueDate: "asc" },
    });
  }

  update(id: string, payload: ReceivablePayload, db: Db = prisma): Promise<ReceivableWithCategory> {
    return db.receivable.update({ where: { id }, data: mapPayload(payload), include });
  }

  settle(id: string, payload: ReceivableSettlementPayload, db: Db = prisma): Promise<ReceivableWithCategory> {
    return db.receivable.update({
      where: { id },
      data: {
        status: "RECEBIDO",
        settledAmount: new Prisma.Decimal(payload.settledAmount ?? 0),
        settledAt: payload.settledAt,
        settlementMethod: payload.settlementMethod,
        settlementBankAccountId: payload.settlementBankAccountId,
      },
      include,
    });
  }

  delete(id: string, db: Db = prisma): Promise<Receivable> {
    return db.receivable.delete({ where: { id } });
  }

  deleteByRecurrenceGroupId(recurrenceGroupId: string, organizationId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.receivable.deleteMany({ where: { recurrenceGroupId, organizationId } });
  }
}

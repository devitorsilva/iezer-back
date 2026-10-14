import { Prisma, type Payable } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { PayablePayload, PayableQuery, PayableSettlementPayload } from "./schemas.js";

const include = { category: true, supplier: true, settlementBankAccount: true } satisfies Prisma.PayableInclude;

export type PayableCreatePayload = PayablePayload & {
  recurrenceGroupId?: string;
};

function mapPayload(payload: PayableCreatePayload) {
  return {
    ...payload,
    amount: new Prisma.Decimal(payload.amount),
  };
}

type Db = Prisma.TransactionClient;

function buildWhere(organizationIds: string[], query: PayableQuery): Prisma.PayableWhereInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    organizationId: { in: organizationIds },
    ...(query.overdue ? { status: { not: "PAGO" }, dueDate: { lt: today } } : {}),
    ...(!query.overdue && query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q
      ? {
          OR: [
            { description: { contains: query.q, mode: "insensitive" } },
            { supplier: { name: { contains: query.q, mode: "insensitive" } } },
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

export type PayableWithCategory = Payable & {
  category: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  settlementBankAccount: { id: string; accountName: string; bankName: string } | null;
};

export class PayableRepository {
  findAll(organizationIds: string[], query: PayableQuery): Promise<PayableWithCategory[]> {
    return prisma.payable.findMany({
      where: buildWhere(organizationIds, query),
      include,
      orderBy: [{ dueDate: "asc" }, { description: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<PayableWithCategory | null> {
    return db.payable.findFirst({ where: { id, organizationId: { in: organizationIds } }, include });
  }

  findByRecurrenceGroupId(recurrenceGroupId: string, organizationId: string, db: Db = prisma) {
    return db.payable.findMany({ where: { recurrenceGroupId, organizationId }, include });
  }

  create(payload: PayableCreatePayload, organizationId: string, db: Db = prisma): Promise<PayableWithCategory> {
    return db.payable.create({ data: { ...mapPayload(payload), organizationId }, include });
  }

  async createMany(
    payloads: PayableCreatePayload[],
    organizationId: string,
    db: Db = prisma,
  ): Promise<PayableWithCategory[]> {
    const created = await db.payable.createManyAndReturn({
      data: payloads.map((payload) => ({ ...mapPayload(payload), organizationId })),
      select: { id: true },
    });

    return db.payable.findMany({
      where: { id: { in: created.map(({ id }) => id) } },
      include,
      orderBy: { dueDate: "asc" },
    });
  }

  update(id: string, payload: PayablePayload, db: Db = prisma): Promise<PayableWithCategory> {
    return db.payable.update({ where: { id }, data: mapPayload(payload), include });
  }

  settle(id: string, payload: PayableSettlementPayload, db: Db = prisma): Promise<PayableWithCategory> {
    return db.payable.update({
      where: { id },
      data: {
        status: "PAGO",
        settledAmount: new Prisma.Decimal(payload.settledAmount ?? 0),
        settledAt: payload.settledAt,
        settlementMethod: payload.settlementMethod,
        settlementBankAccountId: payload.settlementBankAccountId,
      },
      include,
    });
  }

  delete(id: string, db: Db = prisma): Promise<Payable> {
    return db.payable.delete({ where: { id } });
  }

  deleteByRecurrenceGroupId(recurrenceGroupId: string, organizationId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.payable.deleteMany({ where: { recurrenceGroupId, organizationId } });
  }
}

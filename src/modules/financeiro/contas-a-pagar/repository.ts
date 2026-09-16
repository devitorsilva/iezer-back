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

function buildWhere(query: PayableQuery): Prisma.PayableWhereInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
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
  findAll(query: PayableQuery): Promise<PayableWithCategory[]> {
    return prisma.payable.findMany({
      where: buildWhere(query),
      include,
      orderBy: [{ dueDate: "asc" }, { description: "asc" }],
    });
  }

  findById(id: string): Promise<PayableWithCategory | null> {
    return prisma.payable.findUnique({ where: { id }, include });
  }

  create(payload: PayableCreatePayload): Promise<PayableWithCategory> {
    return prisma.payable.create({ data: mapPayload(payload), include });
  }

  createMany(payloads: PayableCreatePayload[]): Promise<Prisma.BatchPayload> {
    return prisma.payable.createMany({
      data: payloads.map(mapPayload),
    });
  }

  update(id: string, payload: PayablePayload): Promise<PayableWithCategory> {
    return prisma.payable.update({ where: { id }, data: mapPayload(payload), include });
  }

  settle(id: string, payload: PayableSettlementPayload): Promise<PayableWithCategory> {
    return prisma.payable.update({
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

  delete(id: string): Promise<Payable> {
    return prisma.payable.delete({ where: { id } });
  }

  deleteByRecurrenceGroupId(recurrenceGroupId: string): Promise<Prisma.BatchPayload> {
    return prisma.payable.deleteMany({ where: { recurrenceGroupId } });
  }
}

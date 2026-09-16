import { Prisma, type Receivable } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { ReceivablePayload, ReceivableQuery, ReceivableSettlementPayload } from "./schemas.js";

const include = { category: true, member: true, settlementBankAccount: true } satisfies Prisma.ReceivableInclude;

export type ReceivableCreatePayload = ReceivablePayload & {
  recurrenceGroupId?: string;
};

function mapPayload(payload: ReceivableCreatePayload) {
  return {
    ...payload,
    amount: new Prisma.Decimal(payload.amount),
  };
}

function buildWhere(query: ReceivableQuery): Prisma.ReceivableWhereInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    ...(query.overdue ? { status: { not: "RECEBIDO" }, dueDate: { lt: today } } : {}),
    ...(!query.overdue && query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q
      ? {
          OR: [
            { description: { contains: query.q, mode: "insensitive" } },
            { source: { contains: query.q, mode: "insensitive" } },
            { member: { name: { contains: query.q, mode: "insensitive" } } },
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
  member: { id: string; name: string } | null;
  settlementBankAccount: { id: string; accountName: string; bankName: string } | null;
};

export class ReceivableRepository {
  findAll(query: ReceivableQuery): Promise<ReceivableWithCategory[]> {
    return prisma.receivable.findMany({
      where: buildWhere(query),
      include,
      orderBy: [{ dueDate: "asc" }, { description: "asc" }],
    });
  }

  findById(id: string): Promise<ReceivableWithCategory | null> {
    return prisma.receivable.findUnique({ where: { id }, include });
  }

  create(payload: ReceivableCreatePayload): Promise<ReceivableWithCategory> {
    return prisma.receivable.create({ data: mapPayload(payload), include });
  }

  createMany(payloads: ReceivableCreatePayload[]): Promise<Prisma.BatchPayload> {
    return prisma.receivable.createMany({
      data: payloads.map(mapPayload),
    });
  }

  update(id: string, payload: ReceivablePayload): Promise<ReceivableWithCategory> {
    return prisma.receivable.update({ where: { id }, data: mapPayload(payload), include });
  }

  settle(id: string, payload: ReceivableSettlementPayload): Promise<ReceivableWithCategory> {
    return prisma.receivable.update({
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

  delete(id: string): Promise<Receivable> {
    return prisma.receivable.delete({ where: { id } });
  }

  deleteByRecurrenceGroupId(recurrenceGroupId: string): Promise<Prisma.BatchPayload> {
    return prisma.receivable.deleteMany({ where: { recurrenceGroupId } });
  }
}

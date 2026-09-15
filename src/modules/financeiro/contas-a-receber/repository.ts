import { Prisma, type Receivable } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { ReceivablePayload, ReceivableQuery } from "./schemas.js";

const include = { category: true, member: true } satisfies Prisma.ReceivableInclude;

function mapPayload(payload: ReceivablePayload) {
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

  create(payload: ReceivablePayload): Promise<ReceivableWithCategory> {
    return prisma.receivable.create({ data: mapPayload(payload), include });
  }

  update(id: string, payload: ReceivablePayload): Promise<ReceivableWithCategory> {
    return prisma.receivable.update({ where: { id }, data: mapPayload(payload), include });
  }

  settle(id: string): Promise<ReceivableWithCategory> {
    return prisma.receivable.update({ where: { id }, data: { status: "RECEBIDO" }, include });
  }

  delete(id: string): Promise<Receivable> {
    return prisma.receivable.delete({ where: { id } });
  }
}

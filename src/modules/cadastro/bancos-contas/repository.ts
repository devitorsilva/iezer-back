import { Prisma, type BankAccount } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { BankAccountPayload } from "./schemas.js";

function mapPayload(payload: BankAccountPayload) {
  return {
    ...payload,
    openingBalance: new Prisma.Decimal(payload.openingBalance),
  };
}

type Db = Prisma.TransactionClient;

export class BankAccountRepository {
  findAll(organizationIds: string[]): Promise<BankAccount[]> {
    return prisma.bankAccount.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: [{ isActive: "desc" }, { bankName: "asc" }, { accountName: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<BankAccount | null> {
    return db.bankAccount.findFirst({
      where: { id, organizationId: { in: organizationIds } },
    });
  }

  create(payload: BankAccountPayload, organizationId: string, db: Db = prisma): Promise<BankAccount> {
    return db.bankAccount.create({
      data: { ...mapPayload(payload), organizationId },
    });
  }

  update(id: string, payload: BankAccountPayload, db: Db = prisma): Promise<BankAccount> {
    return db.bankAccount.update({
      where: { id },
      data: mapPayload(payload),
    });
  }

  delete(id: string, db: Db = prisma): Promise<BankAccount> {
    return db.bankAccount.delete({
      where: { id },
    });
  }
}

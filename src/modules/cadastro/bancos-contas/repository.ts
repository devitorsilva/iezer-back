import { Prisma, type BankAccount } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { BankAccountPayload } from "./schemas.js";

function mapPayload(payload: BankAccountPayload) {
  return {
    ...payload,
    openingBalance: new Prisma.Decimal(payload.openingBalance),
  };
}

export class BankAccountRepository {
  findAll(): Promise<BankAccount[]> {
    return prisma.bankAccount.findMany({
      orderBy: [{ isActive: "desc" }, { bankName: "asc" }, { accountName: "asc" }],
    });
  }

  findById(id: string): Promise<BankAccount | null> {
    return prisma.bankAccount.findUnique({
      where: { id },
    });
  }

  create(payload: BankAccountPayload): Promise<BankAccount> {
    return prisma.bankAccount.create({
      data: mapPayload(payload),
    });
  }

  update(id: string, payload: BankAccountPayload): Promise<BankAccount> {
    return prisma.bankAccount.update({
      where: { id },
      data: mapPayload(payload),
    });
  }

  delete(id: string): Promise<BankAccount> {
    return prisma.bankAccount.delete({
      where: { id },
    });
  }
}

import { Prisma, type BankAccount } from "@prisma/client";
import { BankAccountRepository } from "./repository.js";
import type { BankAccountPayload } from "./schemas.js";

export class BankAccountNotFoundError extends Error {
  constructor() {
    super("BANK_ACCOUNT_NOT_FOUND");
  }
}

export class BankAccountConflictError extends Error {
  constructor() {
    super("BANK_ACCOUNT_CONFLICT");
  }
}

function mapBankAccount(bankAccount: BankAccount) {
  return {
    ...bankAccount,
    openingBalance: bankAccount.openingBalance.toNumber(),
    createdAt: bankAccount.createdAt.toISOString(),
    updatedAt: bankAccount.updatedAt.toISOString(),
  };
}

export class BankAccountService {
  constructor(private readonly repository: BankAccountRepository) {}

  async list() {
    const bankAccounts = await this.repository.findAll();
    return bankAccounts.map(mapBankAccount);
  }

  async getById(id: string) {
    const bankAccount = await this.repository.findById(id);

    if (!bankAccount) {
      throw new BankAccountNotFoundError();
    }

    return mapBankAccount(bankAccount);
  }

  async create(payload: BankAccountPayload) {
    try {
      const bankAccount = await this.repository.create(payload);
      return mapBankAccount(bankAccount);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BankAccountConflictError();
      }

      throw error;
    }
  }

  async update(id: string, payload: BankAccountPayload) {
    await this.assertExists(id);

    try {
      const bankAccount = await this.repository.update(id, payload);
      return mapBankAccount(bankAccount);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BankAccountConflictError();
      }

      throw error;
    }
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const bankAccount = await this.repository.findById(id);

    if (!bankAccount) {
      throw new BankAccountNotFoundError();
    }
  }
}

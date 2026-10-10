import { Prisma, type BankAccount } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
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

type BankAccountDto = ReturnType<typeof mapBankAccount>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: BankAccountDto; after?: BankAccountDto },
): AuditEntry {
  return { organizationId, module: "CADASTRO", action, targetType: "BankAccount", targetId, ...data };
}

export class BankAccountService {
  constructor(private readonly repository: BankAccountRepository) {}

  async list(context: RequestContext) {
    const items = await this.repository.findAll(context.readOrganizationIds);
    return items.map(mapBankAccount);
  }

  async getById(context: RequestContext, id: string) {
    const bankAccount = await this.repository.findById(id, context.readOrganizationIds);
    if (!bankAccount) throw new BankAccountNotFoundError();
    return mapBankAccount(bankAccount);
  }

  async create(context: RequestContext, payload: BankAccountPayload) {
    const organizationId = requireWriteOrganization(context);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const created = mapBankAccount(await this.repository.create(payload, organizationId, tx));
        await audit(auditEntry("criar", organizationId, created.id, { after: created }));
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BankAccountConflictError();
      }
      throw error;
    }
  }

  async update(context: RequestContext, id: string, payload: BankAccountPayload) {
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.assertExists(context, id, tx);
        const updated = mapBankAccount(await this.repository.update(id, payload, tx));
        await audit(
          auditEntry("editar", existing.organizationId, id, { before: mapBankAccount(existing), after: updated }),
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BankAccountConflictError();
      }
      throw error;
    }
  }

  async remove(context: RequestContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      await this.repository.delete(id, tx);
      await audit(auditEntry("excluir", existing.organizationId, id, { before: mapBankAccount(existing) }));
    });
  }

  private async assertExists(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const bankAccount = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!bankAccount) throw new BankAccountNotFoundError();
    return bankAccount;
  }
}

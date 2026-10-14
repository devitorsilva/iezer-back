import { Prisma, type Supplier } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { SupplierRepository } from "./repository.js";
import type { SupplierPayload } from "./schemas.js";

export class SupplierNotFoundError extends Error {
  constructor() {
    super("SUPPLIER_NOT_FOUND");
  }
}

export class SupplierCnpjConflictError extends Error {
  constructor() {
    super("SUPPLIER_CNPJ_CONFLICT");
  }
}

function mapSupplier(supplier: Supplier) {
  return {
    ...supplier,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

type SupplierDto = ReturnType<typeof mapSupplier>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: SupplierDto; after?: SupplierDto },
): AuditEntry {
  return { organizationId, module: "CADASTRO", action, targetType: "Supplier", targetId, ...data };
}

export class SupplierService {
  constructor(private readonly repository: SupplierRepository) {}

  async list(context: RequestContext) {
    const items = await this.repository.findAll(context.readOrganizationIds);
    return items.map(mapSupplier);
  }

  async getById(context: RequestContext, id: string) {
    const supplier = await this.repository.findById(id, context.readOrganizationIds);
    if (!supplier) throw new SupplierNotFoundError();
    return mapSupplier(supplier);
  }

  async create(context: RequestContext, payload: SupplierPayload) {
    const organizationId = requireWriteOrganization(context);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const created = mapSupplier(await this.repository.create(payload, organizationId, tx));
        await audit(auditEntry("criar", organizationId, created.id, { after: created }));
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SupplierCnpjConflictError();
      }
      throw error;
    }
  }

  async update(context: RequestContext, id: string, payload: SupplierPayload) {
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.assertExists(context, id, tx);
        const updated = mapSupplier(await this.repository.update(id, payload, tx));
        await audit(
          auditEntry("editar", existing.organizationId, id, { before: mapSupplier(existing), after: updated }),
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new SupplierCnpjConflictError();
      }
      throw error;
    }
  }

  async remove(context: RequestContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      await this.repository.delete(id, tx);
      await audit(auditEntry("excluir", existing.organizationId, id, { before: mapSupplier(existing) }));
    });
  }

  private async assertExists(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const supplier = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!supplier) throw new SupplierNotFoundError();
    return supplier;
  }
}

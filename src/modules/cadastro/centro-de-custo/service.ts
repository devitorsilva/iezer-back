import { Prisma, type CostCenter } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { CostCenterRepository } from "./repository.js";
import type { CostCenterPayload } from "./schemas.js";

export class CostCenterNotFoundError extends Error {
  constructor() {
    super("COST_CENTER_NOT_FOUND");
  }
}

export class CostCenterConflictError extends Error {
  constructor() {
    super("COST_CENTER_CONFLICT");
  }
}

function mapCostCenter(costCenter: CostCenter) {
  return {
    ...costCenter,
    createdAt: costCenter.createdAt.toISOString(),
    updatedAt: costCenter.updatedAt.toISOString(),
  };
}

type CostCenterDto = ReturnType<typeof mapCostCenter>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: CostCenterDto; after?: CostCenterDto },
): AuditEntry {
  return { organizationId, module: "CADASTRO", action, targetType: "CostCenter", targetId, ...data };
}

export class CostCenterService {
  constructor(private readonly repository: CostCenterRepository) {}

  async list(context: RequestContext) {
    const items = await this.repository.findAll(context.readOrganizationIds);
    return items.map(mapCostCenter);
  }

  async getById(context: RequestContext, id: string) {
    const costCenter = await this.repository.findById(id, context.readOrganizationIds);
    if (!costCenter) throw new CostCenterNotFoundError();
    return mapCostCenter(costCenter);
  }

  async create(context: RequestContext, payload: CostCenterPayload) {
    const organizationId = requireWriteOrganization(context);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const created = mapCostCenter(await this.repository.create(payload, organizationId, tx));
        await audit(auditEntry("criar", organizationId, created.id, { after: created }));
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CostCenterConflictError();
      }
      throw error;
    }
  }

  async update(context: RequestContext, id: string, payload: CostCenterPayload) {
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.assertExists(context, id, tx);
        const updated = mapCostCenter(await this.repository.update(id, payload, tx));
        await audit(
          auditEntry("editar", existing.organizationId, id, { before: mapCostCenter(existing), after: updated }),
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CostCenterConflictError();
      }
      throw error;
    }
  }

  async remove(context: RequestContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      await this.repository.delete(id, tx);
      await audit(auditEntry("excluir", existing.organizationId, id, { before: mapCostCenter(existing) }));
    });
  }

  private async assertExists(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const costCenter = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!costCenter) throw new CostCenterNotFoundError();
    return costCenter;
  }
}

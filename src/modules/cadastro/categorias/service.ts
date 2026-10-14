import { Prisma, type Category } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { CategoryRepository } from "./repository.js";
import type { CategoryPayload } from "./schemas.js";

export class CategoryNotFoundError extends Error {
  constructor() {
    super("CATEGORY_NOT_FOUND");
  }
}

export class CategoryConflictError extends Error {
  constructor() {
    super("CATEGORY_CONFLICT");
  }
}

function mapCategory(category: Category) {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

type CategoryDto = ReturnType<typeof mapCategory>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: CategoryDto; after?: CategoryDto },
): AuditEntry {
  return { organizationId, module: "CADASTRO", action, targetType: "Category", targetId, ...data };
}

export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  async list(context: RequestContext) {
    const items = await this.repository.findAll(context.readOrganizationIds);
    return items.map(mapCategory);
  }

  async getById(context: RequestContext, id: string) {
    const category = await this.repository.findById(id, context.readOrganizationIds);
    if (!category) throw new CategoryNotFoundError();
    return mapCategory(category);
  }

  async create(context: RequestContext, payload: CategoryPayload) {
    const organizationId = requireWriteOrganization(context);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const created = mapCategory(await this.repository.create(payload, organizationId, tx));
        await audit(auditEntry("criar", organizationId, created.id, { after: created }));
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CategoryConflictError();
      }
      throw error;
    }
  }

  async update(context: RequestContext, id: string, payload: CategoryPayload) {
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.assertExists(context, id, tx);
        const updated = mapCategory(await this.repository.update(id, payload, tx));
        await audit(
          auditEntry("editar", existing.organizationId, id, { before: mapCategory(existing), after: updated }),
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CategoryConflictError();
      }
      throw error;
    }
  }

  async remove(context: RequestContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      await this.repository.delete(id, tx);
      await audit(auditEntry("excluir", existing.organizationId, id, { before: mapCategory(existing) }));
    });
  }

  private async assertExists(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const category = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!category) throw new CategoryNotFoundError();
    return category;
  }
}

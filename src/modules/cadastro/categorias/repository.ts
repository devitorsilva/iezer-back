import type { Prisma, Category } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { CategoryPayload } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class CategoryRepository {
  findAll(organizationIds: string[]): Promise<Category[]> {
    return prisma.category.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<Category | null> {
    return db.category.findFirst({
      where: { id, organizationId: { in: organizationIds } },
    });
  }

  create(payload: CategoryPayload, organizationId: string, db: Db = prisma): Promise<Category> {
    return db.category.create({
      data: { ...payload, organizationId },
    });
  }

  update(id: string, payload: CategoryPayload, db: Db = prisma): Promise<Category> {
    return db.category.update({
      where: { id },
      data: payload,
    });
  }

  delete(id: string, db: Db = prisma): Promise<Category> {
    return db.category.delete({
      where: { id },
    });
  }
}

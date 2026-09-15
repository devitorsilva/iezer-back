import type { Category } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { CategoryPayload } from "./schemas.js";

export class CategoryRepository {
  findAll(): Promise<Category[]> {
    return prisma.category.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string): Promise<Category | null> {
    return prisma.category.findUnique({
      where: { id },
    });
  }

  create(payload: CategoryPayload): Promise<Category> {
    return prisma.category.create({
      data: payload,
    });
  }

  update(id: string, payload: CategoryPayload): Promise<Category> {
    return prisma.category.update({
      where: { id },
      data: payload,
    });
  }

  delete(id: string): Promise<Category> {
    return prisma.category.delete({
      where: { id },
    });
  }
}

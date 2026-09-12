import { Prisma, type Category } from "@prisma/client";
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

export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  async list() {
    const categories = await this.repository.findAll();
    return categories.map(mapCategory);
  }

  async getById(id: string) {
    const category = await this.repository.findById(id);

    if (!category) {
      throw new CategoryNotFoundError();
    }

    return mapCategory(category);
  }

  async create(payload: CategoryPayload) {
    try {
      const category = await this.repository.create(payload);
      return mapCategory(category);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new CategoryConflictError();
      }

      throw error;
    }
  }

  async update(id: string, payload: CategoryPayload) {
    await this.assertExists(id);

    try {
      const category = await this.repository.update(id, payload);
      return mapCategory(category);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new CategoryConflictError();
      }

      throw error;
    }
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const category = await this.repository.findById(id);

    if (!category) {
      throw new CategoryNotFoundError();
    }
  }
}

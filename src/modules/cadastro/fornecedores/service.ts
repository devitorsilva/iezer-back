import { Prisma, type Supplier } from "@prisma/client";
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

export class SupplierService {
  constructor(private readonly repository: SupplierRepository) {}

  async list() {
    const suppliers = await this.repository.findAll();
    return suppliers.map(mapSupplier);
  }

  async getById(id: string) {
    const supplier = await this.repository.findById(id);

    if (!supplier) {
      throw new SupplierNotFoundError();
    }

    return mapSupplier(supplier);
  }

  async create(payload: SupplierPayload) {
    try {
      const supplier = await this.repository.create(payload);
      return mapSupplier(supplier);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new SupplierCnpjConflictError();
      }

      throw error;
    }
  }

  async update(id: string, payload: SupplierPayload) {
    await this.assertExists(id);

    try {
      const supplier = await this.repository.update(id, payload);
      return mapSupplier(supplier);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new SupplierCnpjConflictError();
      }

      throw error;
    }
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const supplier = await this.repository.findById(id);

    if (!supplier) {
      throw new SupplierNotFoundError();
    }
  }
}

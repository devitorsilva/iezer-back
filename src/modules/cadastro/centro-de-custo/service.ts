import { Prisma, type CostCenter } from "@prisma/client";
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

export class CostCenterService {
  constructor(private readonly repository: CostCenterRepository) {}

  async list() {
    const costCenters = await this.repository.findAll();
    return costCenters.map(mapCostCenter);
  }

  async getById(id: string) {
    const costCenter = await this.repository.findById(id);

    if (!costCenter) {
      throw new CostCenterNotFoundError();
    }

    return mapCostCenter(costCenter);
  }

  async create(payload: CostCenterPayload) {
    try {
      const costCenter = await this.repository.create(payload);
      return mapCostCenter(costCenter);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new CostCenterConflictError();
      }

      throw error;
    }
  }

  async update(id: string, payload: CostCenterPayload) {
    await this.assertExists(id);

    try {
      const costCenter = await this.repository.update(id, payload);
      return mapCostCenter(costCenter);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new CostCenterConflictError();
      }

      throw error;
    }
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const costCenter = await this.repository.findById(id);

    if (!costCenter) {
      throw new CostCenterNotFoundError();
    }
  }
}

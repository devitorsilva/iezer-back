import type { CostCenter } from "@prisma/client";
import { DEFAULT_ORGANIZATION_ID } from "../../../lib/organization.js";
import { prisma } from "../../../lib/prisma.js";
import type { CostCenterPayload } from "./schemas.js";

export class CostCenterRepository {
  findAll(): Promise<CostCenter[]> {
    return prisma.costCenter.findMany({
      where: { organizationId: DEFAULT_ORGANIZATION_ID },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string): Promise<CostCenter | null> {
    return prisma.costCenter.findUnique({
      where: { id },
    });
  }

  create(payload: CostCenterPayload): Promise<CostCenter> {
    return prisma.costCenter.create({
      data: { ...payload, organizationId: DEFAULT_ORGANIZATION_ID },
    });
  }

  update(id: string, payload: CostCenterPayload): Promise<CostCenter> {
    return prisma.costCenter.update({
      where: { id },
      data: payload,
    });
  }

  delete(id: string): Promise<CostCenter> {
    return prisma.costCenter.delete({
      where: { id },
    });
  }
}

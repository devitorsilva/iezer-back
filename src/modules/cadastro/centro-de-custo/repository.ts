import type { Prisma, CostCenter } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { CostCenterPayload } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class CostCenterRepository {
  findAll(organizationIds: string[]): Promise<CostCenter[]> {
    return prisma.costCenter.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<CostCenter | null> {
    return db.costCenter.findFirst({
      where: { id, organizationId: { in: organizationIds } },
    });
  }

  create(payload: CostCenterPayload, organizationId: string, db: Db = prisma): Promise<CostCenter> {
    return db.costCenter.create({
      data: { ...payload, organizationId },
    });
  }

  update(id: string, payload: CostCenterPayload, db: Db = prisma): Promise<CostCenter> {
    return db.costCenter.update({
      where: { id },
      data: payload,
    });
  }

  delete(id: string, db: Db = prisma): Promise<CostCenter> {
    return db.costCenter.delete({
      where: { id },
    });
  }
}

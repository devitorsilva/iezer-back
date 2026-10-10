import type { Prisma, Supplier } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { SupplierPayload } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class SupplierRepository {
  findAll(organizationIds: string[]): Promise<Supplier[]> {
    return prisma.supplier.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<Supplier | null> {
    return db.supplier.findFirst({
      where: { id, organizationId: { in: organizationIds } },
    });
  }

  create(payload: SupplierPayload, organizationId: string, db: Db = prisma): Promise<Supplier> {
    return db.supplier.create({
      data: { ...payload, organizationId },
    });
  }

  update(id: string, payload: SupplierPayload, db: Db = prisma): Promise<Supplier> {
    return db.supplier.update({
      where: { id },
      data: payload,
    });
  }

  delete(id: string, db: Db = prisma): Promise<Supplier> {
    return db.supplier.delete({
      where: { id },
    });
  }
}

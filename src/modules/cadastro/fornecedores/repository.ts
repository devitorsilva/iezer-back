import type { Supplier } from "@prisma/client";
import { DEFAULT_ORGANIZATION_ID } from "../../../lib/organization.js";
import { prisma } from "../../../lib/prisma.js";
import type { SupplierPayload } from "./schemas.js";

export class SupplierRepository {
  findAll(): Promise<Supplier[]> {
    return prisma.supplier.findMany({
      where: { organizationId: DEFAULT_ORGANIZATION_ID },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string): Promise<Supplier | null> {
    return prisma.supplier.findUnique({
      where: { id },
    });
  }

  create(payload: SupplierPayload): Promise<Supplier> {
    return prisma.supplier.create({
      data: { ...payload, organizationId: DEFAULT_ORGANIZATION_ID },
    });
  }

  update(id: string, payload: SupplierPayload): Promise<Supplier> {
    return prisma.supplier.update({
      where: { id },
      data: payload,
    });
  }

  delete(id: string): Promise<Supplier> {
    return prisma.supplier.delete({
      where: { id },
    });
  }
}

import type { ChurchListItem, ChurchListType, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

export class ChurchListRepository {
  findActive(churchId: string): Promise<ChurchListItem[]> {
    return prisma.churchListItem.findMany({
      where: { organizationId: churchId, isActive: true },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  }

  findActiveItem(id: string, churchId: string, type: ChurchListType, db: Db = prisma) {
    return db.churchListItem.findFirst({
      where: { id, organizationId: churchId, type, isActive: true },
    });
  }
}

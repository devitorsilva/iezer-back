import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

// Igreja-cliente (sede) do usuário, pela primeira atribuição. Um e-mail só pertence
// a uma igreja no MVP (RF-CV08).
export async function findUserChurch(userId: string, db: Prisma.TransactionClient = prisma) {
  const assignment = await db.userAssignment.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      organization: {
        select: { id: true, name: true, parent: { select: { id: true, name: true } } },
      },
    },
  });

  if (!assignment) return null;

  const { organization } = assignment;
  return organization.parent ?? { id: organization.id, name: organization.name };
}

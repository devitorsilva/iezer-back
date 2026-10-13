import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const select = (organizationIds: string[]) =>
  ({
    id: true,
    name: true,
    email: true,
    status: true,
    lastLoginAt: true,
    twoFactorEnabled: true,
    person: { select: { id: true, name: true, organizationId: true, email: true } },
    assignments: {
      where: { organizationId: { in: organizationIds } },
      select: {
        organization: { select: { id: true, name: true, type: true } },
        profile: { select: { id: true, name: true } },
      },
    },
  }) satisfies Prisma.UserSelect;

export type UserWithAssignments = Prisma.UserGetPayload<{ select: ReturnType<typeof select> }>;

export class UserRepository {
  // Usuários com atribuição em alguma das organizações; só essas atribuições vêm junto.
  findAll(organizationIds: string[]): Promise<UserWithAssignments[]> {
    return prisma.user.findMany({
      where: { assignments: { some: { organizationId: { in: organizationIds } } } },
      select: select(organizationIds),
      orderBy: { name: "asc" },
    });
  }

  // Usuário da pessoa, com as atribuições nas organizações informadas.
  findByPersonId(personId: string, organizationIds: string[]): Promise<UserWithAssignments | null> {
    return prisma.user.findUnique({ where: { personId }, select: select(organizationIds) });
  }

  async personExists(personId: string, organizationIds: string[]) {
    const count = await prisma.person.count({ where: { id: personId, organizationId: { in: organizationIds } } });
    return count > 0;
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<UserWithAssignments | null> {
    return db.user.findFirst({
      where: { id, assignments: { some: { organizationId: { in: organizationIds } } } },
      select: select(organizationIds),
    });
  }
}

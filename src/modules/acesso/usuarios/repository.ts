import type { Prisma, UserStatus } from "@prisma/client";
import type { AssignmentData } from "../travas.js";
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

  // Releitura depois de uma alteração: o usuário pode ter ficado sem atribuição nas organizações.
  reload(id: string, organizationIds: string[], db: Db = prisma): Promise<UserWithAssignments> {
    return db.user.findUniqueOrThrow({ where: { id }, select: select(organizationIds) });
  }

  // Todas as atribuições do usuário na igreja (organizações ativas), alcançadas ou não por quem edita.
  findChurchAssignments(userId: string, churchId: string, db: Db = prisma): Promise<AssignmentData[]> {
    return db.userAssignment.findMany({
      where: {
        userId,
        organization: { isActive: true, OR: [{ id: churchId }, { parentId: churchId }] },
        profile: { organizationId: churchId },
      },
      select: { organizationId: true, profileId: true },
    });
  }

  async replaceAssignments(userId: string, removed: AssignmentData[], added: AssignmentData[], db: Db = prisma) {
    if (removed.length) {
      await db.userAssignment.deleteMany({ where: { userId, OR: removed } });
    }
    await db.userAssignment.createMany({
      data: added.map((item) => ({ ...item, userId })),
      skipDuplicates: true,
    });
  }

  async setStatus(id: string, status: UserStatus, db: Db = prisma) {
    await db.user.update({ where: { id }, data: { status } });
  }

  async deleteSessions(userId: string, db: Db = prisma) {
    const { count } = await db.session.deleteMany({ where: { userId } });
    return count;
  }
}

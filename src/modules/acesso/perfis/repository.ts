import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const include = {
  permissions: { select: { permissionKey: true } },
  assignments: { select: { userId: true } },
  inviteAssignments: { where: { invite: { status: "PENDENTE" } }, select: { inviteId: true } },
} satisfies Prisma.AccessProfileInclude;

export type AccessProfileWithPermissions = Prisma.AccessProfileGetPayload<{ include: typeof include }>;

export interface AccessProfileData {
  name: string;
  description: string | null;
  permissions: string[];
}

export class AccessProfileRepository {
  findAll(churchId: string): Promise<AccessProfileWithPermissions[]> {
    return prisma.accessProfile.findMany({
      where: { organizationId: churchId },
      include,
      orderBy: { name: "asc" },
    });
  }

  findById(id: string, churchId: string, db: Db = prisma): Promise<AccessProfileWithPermissions | null> {
    return db.accessProfile.findFirst({ where: { id, organizationId: churchId }, include });
  }

  async nameTaken(churchId: string, name: string, ignoreId?: string, db: Db = prisma) {
    const count = await db.accessProfile.count({
      where: { organizationId: churchId, name: { equals: name, mode: "insensitive" }, id: ignoreId ? { not: ignoreId } : undefined },
    });
    return count > 0;
  }

  create(churchId: string, data: AccessProfileData, db: Db = prisma) {
    return db.accessProfile.create({
      data: {
        organizationId: churchId,
        name: data.name,
        description: data.description,
        permissions: { create: data.permissions.map((permissionKey) => ({ permissionKey })) },
      },
      select: { id: true },
    });
  }

  async update(id: string, data: AccessProfileData, db: Db = prisma) {
    await db.accessProfile.update({ where: { id }, data: { name: data.name, description: data.description } });
    await this.replacePermissions(id, data.permissions, db);
  }

  async replacePermissions(id: string, permissionKeys: string[], db: Db = prisma) {
    await db.accessProfilePermission.deleteMany({ where: { profileId: id } });
    await db.accessProfilePermission.createMany({
      data: permissionKeys.map((permissionKey) => ({ profileId: id, permissionKey })),
    });
  }

  // Excluir (RF-PF04): atribuições e convites pendentes vão para o perfil de destino; convites
  // já encerrados só perdem a linha (o histórico fica no AuditLog).
  async delete(id: string, moveToId: string | null, db: Db = prisma) {
    if (moveToId) {
      const assignments = await db.userAssignment.findMany({
        where: { profileId: id },
        select: { userId: true, organizationId: true },
      });
      await db.userAssignment.createMany({
        data: assignments.map((item) => ({ ...item, profileId: moveToId })),
        skipDuplicates: true,
      });

      const invites = await db.inviteAssignment.findMany({
        where: { profileId: id, invite: { status: "PENDENTE" } },
        select: { inviteId: true, organizationId: true },
      });
      await db.inviteAssignment.createMany({
        data: invites.map((item) => ({ ...item, profileId: moveToId })),
        skipDuplicates: true,
      });
    }

    await db.userAssignment.deleteMany({ where: { profileId: id } });
    await db.inviteAssignment.deleteMany({ where: { profileId: id } });
    await db.accessProfile.delete({ where: { id } });
  }
}

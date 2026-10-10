import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const include = {
  permissions: { select: { permissionKey: true } },
  _count: { select: { assignments: true } },
} satisfies Prisma.AccessProfileInclude;

export type AccessProfileWithPermissions = Prisma.AccessProfileGetPayload<{ include: typeof include }>;

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

  async replacePermissions(id: string, permissionKeys: string[], db: Db = prisma) {
    await db.accessProfilePermission.deleteMany({ where: { profileId: id } });
    await db.accessProfilePermission.createMany({
      data: permissionKeys.map((permissionKey) => ({ profileId: id, permissionKey })),
    });
  }

  // Usuários ativos da igreja com "Gerenciar perfis de acesso" (admins).
  countActiveAdmins(churchId: string, db: Db = prisma) {
    return db.user.count({
      where: {
        status: "ATIVO",
        assignments: {
          some: {
            profile: {
              organizationId: churchId,
              permissions: { some: { permissionKey: "acesso.perfis.gerenciar" } },
            },
          },
        },
      },
    });
  }
}

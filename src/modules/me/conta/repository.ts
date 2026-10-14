import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const EMAIL_CHANGE_PREFIX = "change-email:";

export interface EmailChangeRequest {
  userId: string;
  email: string;
  oldEmail: string;
}

export class AccountRepository {
  findUser(userId: string, db: Db = prisma) {
    return db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        twoFactorEnabled: true,
        person: { select: { id: true, email: true, organizationId: true } },
        accounts: { select: { providerId: true, password: true } },
        twoFactors: { select: { verified: true } },
      },
    });
  }

  listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        location: true,
        twoFactorPending: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteSession(userId: string, id: string, db: Db) {
    const { count } = await db.session.deleteMany({ where: { id, userId } });
    return count;
  }

  async deleteOtherSessions(userId: string, currentId: string, db: Db) {
    const { count } = await db.session.deleteMany({ where: { userId, id: { not: currentId } } });
    return count;
  }

  findAssignments(userId: string) {
    return prisma.userAssignment.findMany({
      where: { userId, organization: { isActive: true } },
      orderBy: [{ organization: { parentId: { sort: "asc", nulls: "first" } } }, { organization: { name: "asc" } }],
      select: {
        organization: { select: { id: true, name: true, type: true } },
        profile: { select: { name: true, permissions: { select: { permissionKey: true } } } },
      },
    });
  }

  // Pedido de troca de e-mail na tabela Verification (como os tokens do Better Auth): só o hash
  // do token no identificador. Um pedido novo substitui os anteriores do usuário.
  async saveEmailChange(tokenHash: string, request: EmailChangeRequest, expiresAt: Date) {
    await prisma.$transaction([
      prisma.verification.deleteMany({
        where: { identifier: { startsWith: EMAIL_CHANGE_PREFIX }, value: { contains: `"userId":"${request.userId}"` } },
      }),
      prisma.verification.create({
        data: { identifier: `${EMAIL_CHANGE_PREFIX}${tokenHash}`, value: JSON.stringify(request), expiresAt },
      }),
    ]);
  }

  async findEmailChange(tokenHash: string, db: Db = prisma) {
    const row = await db.verification.findFirst({
      where: { identifier: `${EMAIL_CHANGE_PREFIX}${tokenHash}`, expiresAt: { gt: new Date() } },
    });
    return row ? { id: row.id, ...(JSON.parse(row.value) as EmailChangeRequest) } : null;
  }

  // Uso único: só um confirmar concorrente passa.
  async consumeEmailChange(id: string, db: Db) {
    const { count } = await db.verification.deleteMany({ where: { id } });
    return count === 1;
  }
}

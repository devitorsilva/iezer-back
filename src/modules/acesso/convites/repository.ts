import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const include = {
  church: { select: { id: true, name: true } },
  person: { select: { id: true, name: true, email: true, organizationId: true } },
  invitedBy: { select: { id: true, name: true } },
  assignments: {
    select: {
      organization: { select: { id: true, name: true, type: true } },
      profile: {
        select: { id: true, name: true, description: true, permissions: { select: { permissionKey: true } } },
      },
    },
  },
} satisfies Prisma.InviteInclude;

export type InviteWithRelations = Prisma.InviteGetPayload<{ include: typeof include }>;

export interface InviteAssignmentData {
  organizationId: string;
  profileId: string;
}

export class InviteRepository {
  // Pendentes (inclusive expirados) com perfil em alguma das organizações, mais recentes primeiro.
  findPending(churchId: string, organizationIds: string[], personId?: string): Promise<InviteWithRelations[]> {
    return prisma.invite.findMany({
      where: {
        churchId,
        personId,
        status: "PENDENTE",
        assignments: { some: { organizationId: { in: organizationIds } } },
      },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string, churchId: string, db: Db = prisma): Promise<InviteWithRelations | null> {
    return db.invite.findFirst({ where: { id, churchId }, include });
  }

  findByTokenHash(tokenHash: string, db: Db = prisma): Promise<InviteWithRelations | null> {
    return db.invite.findUnique({ where: { tokenHash }, include });
  }

  create(
    data: {
      churchId: string;
      personId: string;
      email: string;
      tokenHash: string;
      expiresAt: Date;
      invitedByUserId: string | null;
      assignments: InviteAssignmentData[];
    },
    db: Db = prisma,
  ): Promise<InviteWithRelations> {
    const { assignments, ...invite } = data;
    return db.invite.create({
      data: { ...invite, assignments: { create: assignments } },
      include,
    });
  }

  update(id: string, data: Prisma.InviteUncheckedUpdateInput, db: Db = prisma): Promise<InviteWithRelations> {
    return db.invite.update({ where: { id }, data, include });
  }

  // Consome o convite (uso único): só um aceite concorrente passa.
  async consume(id: string, db: Db) {
    const { count } = await db.invite.updateMany({
      where: { id, status: "PENDENTE", expiresAt: { gt: new Date() } },
      data: { status: "ACEITO", acceptedAt: new Date() },
    });
    return count === 1;
  }
}

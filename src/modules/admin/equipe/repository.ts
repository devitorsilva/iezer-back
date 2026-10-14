import type { Prisma, TeamRole } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const memberInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      twoFactorEnabled: true,
      lastLoginAt: true,
      twoFactors: { where: { verified: true }, select: { id: true }, take: 1 },
    },
  },
  invitedBy: { select: { id: true, name: true } },
} satisfies Prisma.TeamMemberInclude;

const inviteInclude = {
  invitedBy: { select: { id: true, name: true } },
} satisfies Prisma.TeamInviteInclude;

export type TeamMemberWithUser = Prisma.TeamMemberGetPayload<{ include: typeof memberInclude }>;
export type TeamInviteWithRelations = Prisma.TeamInviteGetPayload<{ include: typeof inviteInclude }>;

export class TeamRepository {
  findMembers(): Promise<TeamMemberWithUser[]> {
    return prisma.teamMember.findMany({ include: memberInclude });
  }

  // Pendentes, inclusive vencidos (a tela mostra o vencimento e oferece reenviar).
  findPendingInvites(): Promise<TeamInviteWithRelations[]> {
    return prisma.teamInvite.findMany({ where: { status: "PENDENTE" }, include: inviteInclude });
  }

  findMember(id: string, db: Db = prisma): Promise<TeamMemberWithUser | null> {
    return db.teamMember.findUnique({ where: { id }, include: memberInclude });
  }

  findInvite(id: string, db: Db = prisma): Promise<TeamInviteWithRelations | null> {
    return db.teamInvite.findUnique({ where: { id }, include: inviteInclude });
  }

  findInviteByTokenHash(tokenHash: string): Promise<TeamInviteWithRelations | null> {
    return prisma.teamInvite.findUnique({ where: { tokenHash }, include: inviteInclude });
  }

  createInvite(
    data: { email: string; name: string; roles: TeamRole[]; tokenHash: string; expiresAt: Date; invitedById: string | null },
    db: Db = prisma,
  ): Promise<TeamInviteWithRelations> {
    return db.teamInvite.create({ data, include: inviteInclude });
  }

  updateInvite(id: string, data: Prisma.TeamInviteUpdateInput, db: Db = prisma): Promise<TeamInviteWithRelations> {
    return db.teamInvite.update({ where: { id }, data, include: inviteInclude });
  }

  // Cancela convites pendentes já vencidos do e-mail (liberam o índice único de pendentes).
  cancelExpiredInvites(email: string, db: Db = prisma) {
    return db.teamInvite.updateMany({
      where: { email, status: "PENDENTE", expiresAt: { lte: new Date() } },
      data: { status: "CANCELADO", canceledAt: new Date() },
    });
  }

  // Uso único: só um aceite concorrente consome o convite.
  async consumeInvite(id: string, db: Db = prisma) {
    const { count } = await db.teamInvite.updateMany({
      where: { id, status: "PENDENTE", expiresAt: { gt: new Date() } },
      data: { status: "ACEITO", acceptedAt: new Date() },
    });
    return count === 1;
  }

  updateRoles(id: string, roles: TeamRole[], db: Db = prisma) {
    return db.teamMember.update({ where: { id }, data: { roles } });
  }

  countActiveAdmins(db: Db = prisma) {
    return db.teamMember.count({ where: { roles: { has: "ADMINISTRADOR" }, user: { status: "ATIVO" } } });
  }
}

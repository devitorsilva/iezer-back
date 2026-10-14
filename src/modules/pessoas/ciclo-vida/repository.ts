import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const eventInclude = {
  reason: { select: { name: true } },
  author: { select: { name: true } },
} satisfies Prisma.PersonEventInclude;

const followUpInclude = {
  author: { select: { name: true } },
} satisfies Prisma.FollowUpInclude;

export type PersonEventRow = Prisma.PersonEventGetPayload<{ include: typeof eventInclude }>;
export type FollowUpRow = Prisma.FollowUpGetPayload<{ include: typeof followUpInclude }>;

// Linha do tempo (RF-V02, RF-V06): eventos de vínculo e situação e acompanhamentos. A pessoa já foi
// conferida no escopo do usuário; o histórico vem inteiro, inclusive de antes de uma transferência interna.
export class LifecycleRepository {
  createEvent(data: Prisma.PersonEventUncheckedCreateInput, db: Db) {
    return db.personEvent.create({ data, include: eventInclude });
  }

  createFollowUp(data: Prisma.FollowUpUncheckedCreateInput, db: Db) {
    return db.followUp.create({ data, include: followUpInclude });
  }

  listEvents(personId: string): Promise<PersonEventRow[]> {
    return prisma.personEvent.findMany({ where: { personId }, include: eventInclude });
  }

  listFollowUps(personId: string): Promise<FollowUpRow[]> {
    return prisma.followUp.findMany({ where: { personId }, include: followUpInclude });
  }

  async hasSuspendedUser(personId: string, db: Db) {
    return (await db.user.count({ where: { personId, status: "SUSPENSO" } })) > 0;
  }

  // Sede ou congregação ativa da igreja (destino da transferência interna).
  findChurchOrganization(id: string, churchId: string, db: Db) {
    return db.organization.findFirst({
      where: { id, isActive: true, OR: [{ id: churchId }, { parentId: churchId }] },
      select: { id: true, name: true },
    });
  }
}

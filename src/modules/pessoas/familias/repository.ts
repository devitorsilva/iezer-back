import type { FamilyRole, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

export const familyMemberPersonSelect = {
  id: true,
  name: true,
  preferredName: true,
  birthDate: true,
  bond: true,
  status: true,
  organizationId: true,
} satisfies Prisma.PersonSelect;

const include = {
  organization: { select: { id: true, name: true } },
  members: {
    include: { person: { select: familyMemberPersonSelect } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.FamilyInclude;

export type FamilyWithMembers = Prisma.FamilyGetPayload<{ include: typeof include }>;

const personSelect = {
  ...familyMemberPersonSelect,
  familyMember: { select: { familyId: true, family: { select: { name: true } } } },
} satisfies Prisma.PersonSelect;

export type FamilyCandidate = Prisma.PersonGetPayload<{ select: typeof personSelect }>;

export class FamilyRepository {
  // A família é visível se for de uma organização lida ou tiver alguém dela.
  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<FamilyWithMembers | null> {
    return db.family.findFirst({
      where: {
        id,
        OR: [
          { organizationId: { in: organizationIds } },
          { members: { some: { person: { organizationId: { in: organizationIds } } } } },
        ],
      },
      include,
    });
  }

  findPeople(ids: string[], organizationIds: string[], db: Db): Promise<FamilyCandidate[]> {
    return db.person.findMany({
      where: { id: { in: ids }, organizationId: { in: organizationIds } },
      select: personSelect,
    });
  }

  create(
    data: { organizationId: string; name: string; members: { personId: string; role: FamilyRole }[] },
    db: Db,
  ): Promise<FamilyWithMembers> {
    const { members, ...family } = data;
    return db.family.create({ data: { ...family, members: { create: members } }, include });
  }

  update(id: string, data: { name: string }, db: Db): Promise<FamilyWithMembers> {
    return db.family.update({ where: { id }, data, include });
  }

  addMember(familyId: string, personId: string, role: FamilyRole, db: Db) {
    return db.familyMember.create({ data: { familyId, personId, role } });
  }

  updateMemberRole(personId: string, role: FamilyRole, db: Db) {
    return db.familyMember.update({ where: { personId }, data: { role } });
  }

  removeMember(personId: string, db: Db) {
    return db.familyMember.delete({ where: { personId } });
  }

  delete(id: string, db: Db) {
    return db.family.delete({ where: { id } });
  }
}

import type { FamilyRole, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { normalizeSearchText } from "../../../lib/text.js";
import type { FamilyListQuery } from "./schemas.js";

type Db = Prisma.TransactionClient;

export const familyMemberPersonSelect = {
  id: true,
  name: true,
  preferredName: true,
  sex: true,
  birthDate: true,
  bond: true,
  status: true,
  organizationId: true,
  // Contato, endereço do domicílio e "cadastro incompleto" na lista da família (RF-F06).
  mobilePhone: true,
  email: true,
  secondaryPhone: true,
  postalCode: true,
  street: true,
  number: true,
  complement: true,
  district: true,
  city: true,
  state: true,
  conversionDate: true,
  admissionMethodId: true,
  admissionDate: true,
  consents: { where: { purpose: "CADASTRO", revokedAt: null }, select: { id: true }, take: 1 },
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

// Lista de famílias (RF-F05): contato principal com o endereço do domicílio, sem carregar os membros.
const listInclude = {
  organization: { select: { id: true, name: true } },
  primaryContact: {
    select: {
      id: true,
      name: true,
      preferredName: true,
      organizationId: true,
      mobilePhone: true,
      secondaryPhone: true,
      postalCode: true,
      street: true,
      number: true,
      complement: true,
      district: true,
      city: true,
      state: true,
    },
  },
  _count: { select: { members: true } },
} satisfies Prisma.FamilyInclude;

export type FamilyListRow = Prisma.FamilyGetPayload<{ include: typeof listInclude }>;

// A família é visível se for de uma organização lida ou tiver alguém dela.
function visibleTo(organizationIds: string[]): Prisma.FamilyWhereInput {
  return {
    OR: [
      { organizationId: { in: organizationIds } },
      { members: { some: { person: { organizationId: { in: organizationIds } } } } },
    ],
  };
}

export class FamilyRepository {
  async list(organizationIds: string[], query: FamilyListQuery) {
    const and: Prisma.FamilyWhereInput[] = [visibleTo(organizationIds)];
    if (query.q) {
      const words = normalizeSearchText(query.q).split(" ").filter(Boolean);
      and.push({
        OR: [
          { name: { contains: query.q.trim(), mode: "insensitive" } },
          { members: { some: { person: { AND: words.map((word) => ({ searchName: { contains: word } })) } } } },
        ],
      });
    }
    const where = { AND: and };

    const [items, total] = await Promise.all([
      prisma.family.findMany({
        where,
        include: listInclude,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.family.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<FamilyWithMembers | null> {
    return db.family.findFirst({ where: { id, ...visibleTo(organizationIds) }, include });
  }

  findPeople(ids: string[], organizationIds: string[], db: Db): Promise<FamilyCandidate[]> {
    return db.person.findMany({
      where: { id: { in: ids }, organizationId: { in: organizationIds } },
      select: personSelect,
    });
  }

  create(
    data: {
      organizationId: string;
      name: string;
      primaryContactPersonId: string | null;
      members: { personId: string; role: FamilyRole }[];
    },
    db: Db,
  ): Promise<FamilyWithMembers> {
    const { members, ...family } = data;
    return db.family.create({ data: { ...family, members: { create: members } }, include });
  }

  update(id: string, data: { name: string }, db: Db): Promise<FamilyWithMembers> {
    return db.family.update({ where: { id }, data, include });
  }

  setPrimaryContact(id: string, personId: string | null, db: Db) {
    return db.family.update({ where: { id }, data: { primaryContactPersonId: personId } });
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

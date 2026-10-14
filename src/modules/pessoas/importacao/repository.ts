import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

// Pessoas: ~45 colunas por linha; o Postgres aceita no máximo 65.535 parâmetros por consulta.
const PERSON_BATCH_SIZE = 500;

const basePersonInclude = {
  organization: { select: { name: true } },
  familyMember: {
    select: {
      familyId: true,
      role: true,
      family: {
        select: {
          organizationId: true,
          members: { select: { personId: true, role: true, person: { select: { birthDate: true } } } },
        },
      },
    },
  },
  consents: { where: { purpose: "CADASTRO", revokedAt: null }, select: { id: true }, take: 1 },
} satisfies Prisma.PersonInclude;

export type BasePerson = Prisma.PersonGetPayload<{ include: typeof basePersonInclude }>;

export class ImportRepository {
  findOrganization(id: string) {
    return prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, parentId: true } });
  }

  admissionMethods(churchId: string) {
    return prisma.churchListItem.findMany({
      where: { organizationId: churchId, type: "FORMA_ADMISSAO", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
  }

  // A base inteira da organização, para comparar duplicados e achar responsáveis em memória.
  loadPeople(organizationId: string): Promise<BasePerson[]> {
    return prisma.person.findMany({ where: { organizationId }, include: basePersonInclude });
  }

  async createPeople(data: Prisma.PersonCreateManyInput[], db: Db) {
    for (let start = 0; start < data.length; start += PERSON_BATCH_SIZE) {
      await db.person.createMany({ data: data.slice(start, start + PERSON_BATCH_SIZE) });
    }
  }

  updatePerson(id: string, data: Prisma.PersonUncheckedUpdateInput, db: Db) {
    return db.person.update({ where: { id }, data, select: { id: true } });
  }

  createFamilies(data: Prisma.FamilyCreateManyInput[], db: Db) {
    return db.family.createMany({ data });
  }

  addFamilyMembers(data: Prisma.FamilyMemberCreateManyInput[], db: Db) {
    return db.familyMember.createMany({ data });
  }

  createConsents(data: Prisma.PersonConsentCreateManyInput[], db: Db) {
    return db.personConsent.createMany({ data });
  }
}

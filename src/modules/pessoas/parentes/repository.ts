import type { Prisma, PersonRelationType } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

// O mínimo de cada parente; contato e endereço nunca saem daqui (RF-F12).
export const relativePersonSelect = {
  id: true,
  name: true,
  preferredName: true,
  sex: true,
  birthDate: true,
  status: true,
  organizationId: true,
  organization: { select: { name: true } },
} satisfies Prisma.PersonSelect;

export type RelativePerson = Prisma.PersonGetPayload<{ select: typeof relativePersonSelect }>;

const include = {
  person: { select: relativePersonSelect },
  relative: { select: relativePersonSelect },
} satisfies Prisma.PersonRelationInclude;

export type RelationWithPeople = Prisma.PersonRelationGetPayload<{ include: typeof include }>;

export class PersonRelationRepository {
  findPerson(id: string, organizationIds: string[], db: Db = prisma): Promise<RelativePerson | null> {
    return db.person.findFirst({ where: { id, organizationId: { in: organizationIds } }, select: relativePersonSelect });
  }

  // Pais, filhos e cônjuges de quem está em `personIds`.
  listDirect(personIds: string[], db: Db = prisma): Promise<RelationWithPeople[]> {
    return db.personRelation.findMany({
      where: { OR: [{ personId: { in: personIds } }, { relativeId: { in: personIds } }] },
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  // Avós, irmãos e netos: pais e filhos dos pais (`parentIds`) e filhos dos filhos (`childIds`).
  listSecondLevel(parentIds: string[], childIds: string[], db: Db = prisma): Promise<RelationWithPeople[]> {
    return db.personRelation.findMany({
      where: {
        type: "PAI_MAE",
        OR: [{ relativeId: { in: parentIds } }, { personId: { in: [...parentIds, ...childIds] } }],
      },
      include,
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: string, db: Db = prisma): Promise<RelationWithPeople | null> {
    return db.personRelation.findUnique({ where: { id }, include });
  }

  findBetween(a: string, b: string, db: Db) {
    return db.personRelation.findFirst({
      where: {
        OR: [
          { personId: a, relativeId: b },
          { personId: b, relativeId: a },
        ],
      },
    });
  }

  listParents(childId: string, db: Db) {
    return db.personRelation.findMany({
      where: { relativeId: childId, type: "PAI_MAE" },
      include: { person: { select: { name: true } } },
    });
  }

  // Cônjuges de alguém (a linha pode estar nos dois sentidos).
  listSpouses(personId: string, db: Db) {
    return db.personRelation.findMany({
      where: { type: "CONJUGE", OR: [{ personId }, { relativeId: personId }] },
      include,
    });
  }

  // `descendantId` está abaixo de `ancestorId` (filho, neto…)? Uma consulta só; UNION para no ciclo.
  async isDescendant(ancestorId: string, descendantId: string, db: Db) {
    const rows = await db.$queryRaw<{ found: number }[]>`
      WITH RECURSIVE descendants(id) AS (
        SELECT "relativeId" FROM "PersonRelation" WHERE "personId" = ${ancestorId} AND "type" = 'PAI_MAE'
        UNION
        SELECT r."relativeId" FROM "PersonRelation" r
        JOIN descendants d ON r."personId" = d.id
        WHERE r."type" = 'PAI_MAE'
      )
      SELECT 1 AS found FROM descendants WHERE id = ${descendantId} LIMIT 1`;
    return rows.length > 0;
  }

  create(
    data: { organizationId: string; personId: string; relativeId: string; type: PersonRelationType },
    db: Db,
  ): Promise<RelationWithPeople> {
    return db.personRelation.create({ data, include });
  }

  delete(id: string, db: Db) {
    return db.personRelation.delete({ where: { id } });
  }
}

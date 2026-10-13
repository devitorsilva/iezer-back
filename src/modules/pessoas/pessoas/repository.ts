import { Prisma, type FamilyRole } from "@prisma/client";
import { addDays, yearsAgo } from "../../../lib/civil-date.js";
import { prisma } from "../../../lib/prisma.js";
import { normalizeSearchText } from "../../../lib/text.js";
import { familyMemberPersonSelect } from "../familias/repository.js";
import type { PersonListQuery } from "./schemas.js";

type Db = Prisma.TransactionClient;

const listInclude = {
  organization: { select: { id: true, name: true } },
  familyMember: { select: { familyId: true, role: true } },
} satisfies Prisma.PersonInclude;

export const detailInclude = {
  organization: { select: { id: true, name: true } },
  admissionMethod: { select: { id: true, name: true } },
  familyMember: {
    include: {
      family: {
        include: {
          members: {
            include: { person: { select: familyMemberPersonSelect } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  },
  consents: {
    where: { purpose: "CADASTRO", revokedAt: null },
    orderBy: { givenAt: "desc" },
    take: 1,
    include: { givenBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.PersonInclude;

export type PersonListItem = Prisma.PersonGetPayload<{ include: typeof listInclude }>;
export type PersonDetail = Prisma.PersonGetPayload<{ include: typeof detailInclude }>;

const duplicateSelect = {
  id: true,
  name: true,
  preferredName: true,
  bond: true,
  status: true,
  birthDate: true,
  cpf: true,
  email: true,
  mobilePhone: true,
  searchName: true,
  organization: { select: { id: true, name: true } },
} satisfies Prisma.PersonSelect;

export type DuplicateCandidate = Prisma.PersonGetPayload<{ select: typeof duplicateSelect }>;

const SORTS: Record<Exclude<PersonListQuery["sort"], "aniversario">, Prisma.PersonOrderByWithRelationInput[]> = {
  nome: [{ name: "asc" }],
  "-nome": [{ name: "desc" }],
  cadastro: [{ createdAt: "asc" }],
  "-cadastro": [{ createdAt: "desc" }],
  nascimento: [{ birthDate: { sort: "asc", nulls: "last" } }],
  "-nascimento": [{ birthDate: { sort: "desc", nulls: "last" } }],
};

export class PersonRepository {
  async list(organizationIds: string[], query: PersonListQuery) {
    const where = await this.buildWhere(organizationIds, query);
    if (query.sort === "aniversario") return this.listByBirthday(where, query);

    const [items, total] = await Promise.all([
      prisma.person.findMany({
        where,
        include: listInclude,
        orderBy: [...SORTS[query.sort], { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.person.count({ where }),
    ]);
    return { items, total };
  }

  // Aniversariantes: por mês e dia de nascimento (sem data por último), depois nome. Ordena em memória:
  // a lista filtrada de uma igreja cabe nela, e o Prisma não ordena por parte da data.
  private async listByBirthday(where: Prisma.PersonWhereInput, query: PersonListQuery) {
    const rows = await prisma.person.findMany({ where, select: { id: true, name: true, birthDate: true } });
    const key = (date: Date | null) => (date ? date.getUTCMonth() * 100 + date.getUTCDate() : Number.MAX_SAFE_INTEGER);
    rows.sort((a, b) => key(a.birthDate) - key(b.birthDate) || a.name.localeCompare(b.name, "pt-BR"));

    const pageIds = rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((row) => row.id);
    const items = await prisma.person.findMany({ where: { id: { in: pageIds } }, include: listInclude });
    const byId = new Map(items.map((item) => [item.id, item]));
    return { items: pageIds.flatMap((id) => byId.get(id) ?? []), total: rows.length };
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<PersonDetail | null> {
    return db.person.findFirst({
      where: { id, organizationId: { in: organizationIds } },
      include: detailInclude,
    });
  }

  findManyByIds(ids: string[], organizationIds: string[], db: Db): Promise<PersonDetail[]> {
    return db.person.findMany({
      where: { id: { in: ids }, organizationId: { in: organizationIds } },
      include: detailInclude,
    });
  }

  updateMany(ids: string[], data: Prisma.PersonUncheckedUpdateManyInput, db: Db) {
    return db.person.updateMany({ where: { id: { in: ids } }, data });
  }

  findByCpf(cpf: string, organizationIds: string[], excludeId?: string | null, db: Db = prisma) {
    return db.person.findFirst({
      where: { cpf, organizationId: { in: organizationIds }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, name: true },
    });
  }

  // RF-C02: candidatos por CPF, email, celular ou mesma data de nascimento (o nome é comparado no service).
  findDuplicateCandidates(
    organizationIds: string[],
    criteria: { cpf?: string; email?: string; mobilePhone?: string; birthDate?: Date },
    excludeId?: string | null,
  ): Promise<DuplicateCandidate[]> {
    const or: Prisma.PersonWhereInput[] = [];
    if (criteria.cpf) or.push({ cpf: criteria.cpf });
    if (criteria.email) or.push({ email: { equals: criteria.email, mode: "insensitive" } });
    if (criteria.mobilePhone) {
      or.push({ mobilePhone: criteria.mobilePhone }, { secondaryPhone: criteria.mobilePhone });
    }
    if (criteria.birthDate) or.push({ birthDate: criteria.birthDate });
    if (or.length === 0) return Promise.resolve([]);

    return prisma.person.findMany({
      where: {
        organizationId: { in: organizationIds },
        OR: or,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: duplicateSelect,
      orderBy: { name: "asc" },
      take: 50,
    });
  }

  create(data: Prisma.PersonUncheckedCreateInput, db: Db) {
    return db.person.create({ data, include: detailInclude });
  }

  update(id: string, data: Prisma.PersonUncheckedUpdateInput, db: Db) {
    return db.person.update({ where: { id }, data, include: detailInclude });
  }

  delete(id: string, db: Db) {
    return db.person.delete({ where: { id } });
  }

  // Contribuições da pessoa (RT-B04): recebíveis vinculados, somente leitura.
  listContributions(personId: string, organizationIds: string[]) {
    return prisma.receivable.findMany({
      where: { personId, organizationId: { in: organizationIds } },
      include: { category: { select: { name: true } }, organization: { select: { name: true } } },
      orderBy: [{ dueDate: "desc" }, { id: "asc" }],
    });
  }

  // Vínculos que impedem apagar o registro (RF-V05).
  async countLinks(id: string, db: Db) {
    const [receivables, family, user, followUps, consentsGiven] = await Promise.all([
      db.receivable.count({ where: { personId: id } }),
      db.familyMember.count({ where: { personId: id } }),
      db.user.count({ where: { personId: id } }),
      db.followUp.count({ where: { personId: id } }),
      db.personConsent.count({ where: { givenByPersonId: id } }),
    ]);
    return { receivables, family, user, followUps, consentsGiven };
  }

  createFamily(organizationId: string, name: string, db: Db) {
    return db.family.create({ data: { organizationId, name } });
  }

  addFamilyMember(familyId: string, personId: string, role: FamilyRole, db: Db) {
    return db.familyMember.create({ data: { familyId, personId, role } });
  }

  createConsent(data: Prisma.PersonConsentUncheckedCreateInput, db: Db) {
    return db.personConsent.create({ data });
  }

  private async buildWhere(organizationIds: string[], query: PersonListQuery): Promise<Prisma.PersonWhereInput> {
    const and: Prisma.PersonWhereInput[] = [];

    const scope = query.organizacao
      ? organizationIds.filter((organizationId) => organizationId === query.organizacao)
      : organizationIds;
    and.push({ organizationId: { in: scope } });

    if (query.situacao !== "todas") and.push({ status: { in: query.situacao ?? ["ATIVO"] } });
    if (query.vinculo) and.push({ bond: { in: query.vinculo } });
    if (query.sexo) and.push({ sex: query.sexo });
    if (query.batizado !== undefined) and.push({ isBaptized: query.batizado });
    if (query.familia !== undefined) and.push({ familyMember: query.familia ? { isNot: null } : { is: null } });
    if (query.semContato) and.push({ mobilePhone: null, secondaryPhone: null, email: null });

    // Idade em anos completos hoje: idadeMin ≤ idade ≤ idadeMax.
    if (query.idadeMin !== undefined) and.push({ birthDate: { lte: yearsAgo(query.idadeMin) } });
    if (query.idadeMax !== undefined) and.push({ birthDate: { gte: addDays(yearsAgo(query.idadeMax + 1), 1) } });

    if (query.aniversarioMes !== undefined) {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Person"
        WHERE "organizationId" = ANY(${scope}) AND EXTRACT(MONTH FROM "birthDate") = ${query.aniversarioMes}`;
      and.push({ id: { in: rows.map((row) => row.id) } });
    }

    if (query.q) and.push(searchFilter(query.q));

    return { AND: and };
  }
}

// RF-L01: nome e apelido sem acento (todas as palavras), CPF, telefone e email.
function searchFilter(q: string): Prisma.PersonWhereInput {
  const words = normalizeSearchText(q).split(" ").filter(Boolean);
  const digits = q.replace(/\D/g, "");
  const or: Prisma.PersonWhereInput[] = [
    { AND: words.map((word) => ({ searchName: { contains: word } })) },
    { email: { contains: q.trim(), mode: "insensitive" } },
  ];

  if (digits.length >= 3) or.push({ cpf: { contains: digits } });
  if (digits.length >= 4) {
    or.push({ mobilePhone: { contains: digits } }, { secondaryPhone: { contains: digits } });
  }

  return { OR: or };
}

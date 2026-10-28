import { Prisma, type FamilyRole, type PersonBond } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { ageOn } from "../../../lib/civil-date.js";
import { AppError } from "../../../lib/errors.js";
import {
  familyAddressOf,
  familyNameFor,
  firstAdult,
  isGuardianMember,
  membersWithoutGuardian,
  missingFields,
  sameAddress,
  type FamilyAddress,
  type FamilyMemberRule,
} from "../pessoas/rules.js";
import type { PersonService } from "../pessoas/service.js";
import type { FamilyCandidate, FamilyRepository, FamilyWithMembers, familyMemberPersonSelect } from "./repository.js";
import type {
  FamilyAddressPayload,
  FamilyCreatePayload,
  FamilyMemberPayload,
  FamilyMemberUpdatePayload,
  FamilyPrimaryContactPayload,
  FamilyUpdatePayload,
} from "./schemas.js";

export class FamilyNotFoundError extends Error {
  constructor() {
    super("FAMILY_NOT_FOUND");
  }
}

export class FamilyMemberNotFoundError extends Error {
  constructor() {
    super("FAMILY_MEMBER_NOT_FOUND");
  }
}

type Db = Prisma.TransactionClient;

type MemberWithPerson = Prisma.FamilyMemberGetPayload<{
  include: { person: { select: typeof familyMemberPersonSelect } };
}>;

interface FamilyRow {
  primaryContactPersonId: string | null;
  members: MemberWithPerson[];
}

// Endereço do domicílio (RF-F03): o do contato principal.
function addressOf(family: FamilyRow) {
  const primary = family.members.find((member) => member.personId === family.primaryContactPersonId);
  return primary ? familyAddressOf(primary.person) : null;
}

// Também usado no detalhe da pessoa. Com `readOrganizationIds`, contato e endereço de quem é de uma
// organização que o usuário não lê ficam de fora (a família pode juntar sede e congregação).
export function mapFamilyMembers(family: FamilyRow, readOrganizationIds?: string[]) {
  const address = addressOf(family);
  return family.members.map((member) => {
    const readable = !readOrganizationIds || readOrganizationIds.includes(member.person.organizationId);
    const hasGuardian = family.members.some(
      (other) =>
        other.personId !== member.personId && isGuardianMember({ role: other.role, birthDate: other.person.birthDate }),
    );
    const missing = missingFields({ ...member.person, hasGuardian, hasConsent: member.person.consents.length > 0 });
    return {
      personId: member.personId,
      name: member.person.name,
      preferredName: member.person.preferredName,
      sex: member.person.sex,
      role: member.role,
      age: member.person.birthDate ? ageOn(member.person.birthDate) : null,
      bond: member.person.bond,
      status: member.person.status,
      isGuardian: isGuardianMember({ role: member.role, birthDate: member.person.birthDate }),
      // Ordem de entrada (RF-F08).
      joinedAt: member.createdAt.toISOString(),
      isPrimaryContact: member.personId === family.primaryContactPersonId,
      // Lido pelo usuário: abre a ficha e pode receber o "Atualizar endereço".
      readable,
      mobilePhone: readable ? member.person.mobilePhone : null,
      email: readable ? member.person.email : null,
      incomplete: readable && missing.length > 0,
      usesFamilyAddress: readable && address !== null && sameAddress(member.person, address),
    };
  });
}

export function mapFamilyAddress(family: FamilyRow, readOrganizationIds?: string[]) {
  const primary = family.members.find((member) => member.personId === family.primaryContactPersonId);
  if (primary && readOrganizationIds && !readOrganizationIds.includes(primary.person.organizationId)) return null;
  return addressOf(family);
}

function mapFamily(family: FamilyWithMembers, readOrganizationIds: string[]) {
  return {
    id: family.id,
    name: family.name,
    organizationId: family.organizationId,
    organizationName: family.organization.name,
    primaryContactPersonId: family.primaryContactPersonId,
    address: mapFamilyAddress(family, readOrganizationIds),
    members: mapFamilyMembers(family, readOrganizationIds),
  };
}

function toRule(member: { personId: string; role: FamilyRole; person: { birthDate: Date | null; bond: PersonBond } }) {
  return { personId: member.personId, role: member.role, birthDate: member.person.birthDate, bond: member.person.bond };
}

function auditEntry(
  action: string,
  family: { id: string; organizationId: string },
  data: { before?: unknown; after?: unknown; personIds?: string[] },
): AuditEntry {
  return { organizationId: family.organizationId, module: "PESSOAS", action, targetType: "Family", targetId: family.id, ...data };
}

function personInFamilyError(person: FamilyCandidate) {
  const familyName = person.familyMember!.family.name;
  return new AppError(
    409,
    "PERSON_IN_FAMILY",
    `${person.name} já faz parte da ${familyName}. Remova da família atual primeiro.`,
    { personId: person.id, familyId: person.familyMember!.familyId, familyName },
  );
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Família básica (RF-F01 a RF-F03, RF-F08, RT-B11). Toda mudança confere a trava do menor (RF-F02):
// ninguém que precisa de responsável fica sem um por causa dela.
export class FamilyService {
  constructor(
    private readonly repository: FamilyRepository,
    private readonly people: PersonService,
  ) {}

  async create(context: RequestContext, payload: FamilyCreatePayload) {
    return this.handleConflict(() =>
      runAudited(context.actor, async (tx, audit) => {
        const ids = payload.members.map((member) => member.personId);
        const people = await this.loadPeople(context, ids, tx);
        const byId = new Map(people.map((person) => [person.id, person]));

        const inFamily = people.find((person) => person.familyMember);
        if (inFamily) throw personInFamilyError(inFamily);

        const first = byId.get(ids[0])!;
        const head = payload.members.find((member) => member.role === "RESPONSAVEL");
        const name = payload.name ?? familyNameFor(byId.get(head?.personId ?? first.id)!.name);
        // Entram juntos: a ordem do pedido é a ordem de entrada.
        const primaryContactPersonId = firstAdult(ids.map((personId) => ({ personId, birthDate: byId.get(personId)!.birthDate })));

        const family = await this.repository.create(
          { organizationId: first.organizationId, name, primaryContactPersonId, members: payload.members },
          tx,
        );
        const dto = mapFamily(family, context.readOrganizationIds);
        await audit(auditEntry("criar", family, { after: { name: dto.name, primaryContactPersonId, members: payload.members } }));
        return dto;
      }),
    );
  }

  async update(context: RequestContext, id: string, payload: FamilyUpdatePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const family = await this.assertExists(context, id, tx);
      const updated = await this.repository.update(id, { name: payload.name }, tx);
      await audit(
        auditEntry("renomear", family, {
          before: { name: family.name },
          after: { name: updated.name },
          personIds: family.members.map((member) => member.personId),
        }),
      );
      return mapFamily(updated, context.readOrganizationIds);
    });
  }

  async addMember(context: RequestContext, id: string, payload: FamilyMemberPayload) {
    return this.handleConflict(() =>
      runAudited(context.actor, async (tx, audit) => {
        const family = await this.assertExists(context, id, tx);
        const [person] = await this.loadPeople(context, [payload.personId], tx);
        if (person.familyMember) throw personInFamilyError(person);

        await this.repository.addMember(id, person.id, payload.role, tx);
        // Domicílio sem contato principal: o primeiro adulto que entra passa a ser.
        const primary = !family.primaryContactPersonId && firstAdult([{ personId: person.id, birthDate: person.birthDate }]);
        if (primary) await this.repository.setPrimaryContact(id, primary, tx);
        await audit(
          auditEntry("adicionar_membro", family, {
            after: { personId: person.id, role: payload.role, ...(primary ? { primaryContactPersonId: primary } : {}) },
          }),
        );

        const address = payload.useFamilyAddress ? addressOf(family) : null;
        if (address) await this.people.applyFamilyAddress(context, [person.id], address, tx, audit);
        return this.reload(context, id, tx);
      }),
    );
  }

  async updateMember(context: RequestContext, id: string, personId: string, payload: FamilyMemberUpdatePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const family = await this.assertExists(context, id, tx);
      const member = this.assertMember(context, family, personId);

      const before = family.members.map(toRule);
      const after = before.map((rule) => (rule.personId === personId ? { ...rule, role: payload.role } : rule));
      this.assertGuardians(family, before, after);

      await this.repository.updateMemberRole(personId, payload.role, tx);
      await audit(
        auditEntry("trocar_papel", family, {
          before: { personId, role: member.role },
          after: { personId, role: payload.role },
        }),
      );
      return this.reload(context, id, tx);
    });
  }

  // Sem ninguém, a família é apagada. Devolve a família restante (ou null). Saiu o contato principal:
  // o papel passa ao próximo adulto pela ordem de entrada, ou fica vazio (RF-F08).
  async removeMember(context: RequestContext, id: string, personId: string) {
    return runAudited(context.actor, async (tx, audit) => {
      const family = await this.assertExists(context, id, tx);
      const member = this.assertMember(context, family, personId);

      const before = family.members.map(toRule);
      const remaining = before.filter((rule) => rule.personId !== personId);
      const removed = before.find((rule) => rule.personId === personId)!;
      this.assertGuardians(family, before, remaining, [removed]);

      await this.repository.removeMember(personId, tx);

      if (remaining.length === 0) {
        await audit(auditEntry("remover_membro", family, { before: { personId, role: member.role } }));
        await this.repository.delete(id, tx);
        await audit(auditEntry("apagar", family, { before: { id: family.id, name: family.name } }));
        return null;
      }

      const wasPrimary = family.primaryContactPersonId === personId;
      const next = wasPrimary ? firstAdult(remaining) : family.primaryContactPersonId;
      if (wasPrimary) await this.repository.setPrimaryContact(id, next, tx);
      await audit(
        auditEntry("remover_membro", family, {
          before: { personId, role: member.role, ...(wasPrimary ? { primaryContactPersonId: personId } : {}) },
          after: wasPrimary ? { primaryContactPersonId: next } : undefined,
          personIds: wasPrimary && next ? [personId, next] : [personId],
        }),
      );
      return this.reload(context, id, tx);
    });
  }

  async setPrimaryContact(context: RequestContext, id: string, payload: FamilyPrimaryContactPayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const family = await this.assertExists(context, id, tx);
      this.assertMember(context, family, payload.personId);
      if (family.primaryContactPersonId === payload.personId) return mapFamily(family, context.readOrganizationIds);

      await this.repository.setPrimaryContact(id, payload.personId, tx);
      await audit(
        auditEntry("definir_contato_principal", family, {
          before: { primaryContactPersonId: family.primaryContactPersonId },
          after: { primaryContactPersonId: payload.personId },
          personIds: [family.primaryContactPersonId, payload.personId].filter((value): value is string => Boolean(value)),
        }),
      );
      return this.reload(context, id, tx);
    });
  }

  // "Atualizar endereço" (RF-F03): grava em quem foi marcado. O domicílio não guarda endereço próprio;
  // marcando o contato principal, muda também o que se sugere a quem entrar.
  async updateAddress(context: RequestContext, id: string, payload: FamilyAddressPayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const family = await this.assertExists(context, id, tx);
      for (const personId of payload.aplicarA) this.assertMember(context, family, personId);

      const { aplicarA, ...fields } = payload;
      const address = {
        postalCode: fields.postalCode ?? null,
        street: fields.street ?? null,
        number: fields.number ?? null,
        complement: fields.complement ?? null,
        district: fields.district ?? null,
        city: fields.city ?? null,
        state: fields.state ?? null,
        secondaryPhone: fields.secondaryPhone ?? null,
      } satisfies FamilyAddress;
      await this.people.applyFamilyAddress(context, aplicarA, address, tx, audit);
      return this.reload(context, id, tx);
    });
  }

  private async reload(context: RequestContext, id: string, db: Db) {
    return mapFamily((await this.repository.findById(id, context.readOrganizationIds, db))!, context.readOrganizationIds);
  }

  private async assertExists(context: RequestContext, id: string, db: Db) {
    const family = await this.repository.findById(id, context.readOrganizationIds, db);
    if (!family) throw new FamilyNotFoundError();
    return family;
  }

  // Só mexe em quem o usuário enxerga.
  private assertMember(context: RequestContext, family: FamilyWithMembers, personId: string) {
    const member = family.members.find((item) => item.personId === personId);
    if (!member || !context.readOrganizationIds.includes(member.person.organizationId)) {
      throw new FamilyMemberNotFoundError();
    }
    return member;
  }

  private async loadPeople(context: RequestContext, ids: string[], db: Db) {
    const people = await this.repository.findPeople(ids, context.readOrganizationIds, db);
    if (people.length !== ids.length) throw new AppError(400, "INVALID_REFERENCE", "Pessoa não encontrada.");
    return people;
  }

  // `alone`: quem sai da família e fica sem nenhuma.
  private assertGuardians(
    family: FamilyWithMembers,
    before: FamilyMemberRule[],
    after: FamilyMemberRule[],
    alone: FamilyMemberRule[] = [],
  ) {
    const had = new Set(membersWithoutGuardian(before));
    const orphans = [...membersWithoutGuardian(after), ...alone.flatMap((rule) => membersWithoutGuardian([rule]))].filter(
      (personId) => !had.has(personId),
    );
    if (orphans.length === 0) return;

    const names = family.members
      .filter((member) => orphans.includes(member.personId))
      .map((member) => member.person.name)
      .join(", ");
    throw new AppError(
      400,
      "GUARDIAN_REQUIRED",
      `${names} ficaria sem responsável. Menores de 18 anos e membros em formação precisam de um responsável ou cônjuge maior de idade na família.`,
      { personIds: orphans },
    );
  }

  private async handleConflict<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "PERSON_IN_FAMILY", "Esta pessoa já faz parte de outra família.");
      }
      throw error;
    }
  }
}

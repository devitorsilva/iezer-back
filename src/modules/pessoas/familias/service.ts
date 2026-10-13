import { Prisma, type FamilyRole, type PersonBond, type PersonStatus } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { ageOn } from "../../../lib/civil-date.js";
import { AppError } from "../../../lib/errors.js";
import {
  familyNameFor,
  isGuardianMember,
  membersWithoutGuardian,
  type FamilyMemberRule,
} from "../pessoas/rules.js";
import type { FamilyCandidate, FamilyRepository, FamilyWithMembers } from "./repository.js";
import type {
  FamilyCreatePayload,
  FamilyMemberPayload,
  FamilyMemberUpdatePayload,
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

interface MemberWithPerson {
  personId: string;
  role: FamilyRole;
  person: {
    name: string;
    preferredName: string | null;
    birthDate: Date | null;
    bond: PersonBond;
    status: PersonStatus;
  };
}

// Também usado no detalhe da pessoa.
export function mapFamilyMembers(members: MemberWithPerson[]) {
  return members.map((member) => ({
    personId: member.personId,
    name: member.person.name,
    preferredName: member.person.preferredName,
    role: member.role,
    age: member.person.birthDate ? ageOn(member.person.birthDate) : null,
    bond: member.person.bond,
    status: member.person.status,
    isGuardian: isGuardianMember({ role: member.role, birthDate: member.person.birthDate }),
  }));
}

function mapFamily(family: FamilyWithMembers) {
  return {
    id: family.id,
    name: family.name,
    organizationId: family.organizationId,
    organizationName: family.organization.name,
    members: mapFamilyMembers(family.members),
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

// Família básica (RF-F01 a RF-F03, RT-B11). Toda mudança confere a trava do menor (RF-F02):
// ninguém que precisa de responsável fica sem um por causa dela.
export class FamilyService {
  constructor(private readonly repository: FamilyRepository) {}

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

        const family = await this.repository.create(
          { organizationId: first.organizationId, name, members: payload.members },
          tx,
        );
        const dto = mapFamily(family);
        await audit(auditEntry("criar", family, { after: dto }));
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
      return mapFamily(updated);
    });
  }

  async addMember(context: RequestContext, id: string, payload: FamilyMemberPayload) {
    return this.handleConflict(() =>
      runAudited(context.actor, async (tx, audit) => {
        const family = await this.assertExists(context, id, tx);
        const [person] = await this.loadPeople(context, [payload.personId], tx);
        if (person.familyMember) throw personInFamilyError(person);

        await this.repository.addMember(id, person.id, payload.role, tx);
        await audit(auditEntry("adicionar_membro", family, { after: payload }));
        return mapFamily((await this.repository.findById(id, context.readOrganizationIds, tx))!);
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
      return mapFamily((await this.repository.findById(id, context.readOrganizationIds, tx))!);
    });
  }

  // Sem ninguém, a família é apagada. Devolve a família restante (ou null).
  async removeMember(context: RequestContext, id: string, personId: string) {
    return runAudited(context.actor, async (tx, audit) => {
      const family = await this.assertExists(context, id, tx);
      const member = this.assertMember(context, family, personId);

      const before = family.members.map(toRule);
      const remaining = before.filter((rule) => rule.personId !== personId);
      const removed = before.find((rule) => rule.personId === personId)!;
      this.assertGuardians(family, before, remaining, [removed]);

      await this.repository.removeMember(personId, tx);
      await audit(auditEntry("remover_membro", family, { before: { personId, role: member.role } }));

      if (remaining.length === 0) {
        await this.repository.delete(id, tx);
        await audit(auditEntry("apagar", family, { before: { id: family.id, name: family.name } }));
        return null;
      }
      return mapFamily((await this.repository.findById(id, context.readOrganizationIds, tx))!);
    });
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

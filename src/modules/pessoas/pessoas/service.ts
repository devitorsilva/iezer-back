import { Prisma, type FamilyRole, type PersonBond } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry, type AuditWriter } from "../../../lib/audit.js";
import { ageOn, formatCivilDate, parseCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { isValidCpf, normalizeCpf } from "../../../lib/cpf.js";
import { AppError } from "../../../lib/errors.js";
import { normalizePhone } from "../../../lib/phone.js";
import { normalizeSearchText } from "../../../lib/text.js";
import type { ChurchListRepository } from "../listas/repository.js";
import type { PersonDetail, PersonListItem, PersonRepository } from "./repository.js";
import {
  describeMissing,
  familyNameFor,
  isMinor,
  missingFields,
  type MissingField,
  type RequirementInput,
} from "./rules.js";
import type {
  DuplicateQuery,
  GuardianPayload,
  PersonCreatePayload,
  PersonListQuery,
  PersonUpdatePayload,
} from "./schemas.js";

// Versão do texto de consentimento de cadastro (RF-P02). Mudou o texto, muda a versão.
export const CONSENT_TEXT_VERSION = "cadastro-2026-10";

const GUARDIAN_ROLES: FamilyRole[] = ["RESPONSAVEL", "CONJUGE"];

export class PersonNotFoundError extends Error {
  constructor() {
    super("PERSON_NOT_FOUND");
  }
}

type Db = Prisma.TransactionClient;

const CIVIL_DATE_FIELDS = [
  "birthDate",
  "firstVisitDate",
  "conversionDate",
  "presentationDate",
  "baptismDate",
  "professionOfFaithDate",
  "admissionDate",
] as const;

type CivilDateField = (typeof CIVIL_DATE_FIELDS)[number];

function familyGuardianIds(person: PersonDetail) {
  const members = person.familyMember?.family.members ?? [];
  return members
    .filter((member) => member.personId !== person.id && GUARDIAN_ROLES.includes(member.role))
    .filter((member) => !isMinor(member.person.birthDate))
    .map((member) => member.personId);
}

function requirementInput(person: PersonDetail): RequirementInput {
  return {
    ...person,
    hasGuardian: familyGuardianIds(person).length > 0,
    hasConsent: person.consents.length > 0,
  };
}

function mapDetail(person: PersonDetail) {
  const { organization, admissionMethod, familyMember, consents, searchName: _searchName, ...fields } = person;
  const consent = consents[0] ?? null;
  const missing = missingFields(requirementInput(person));
  const dates = Object.fromEntries(
    CIVIL_DATE_FIELDS.map((field) => [field, formatCivilDate(person[field])]),
  ) as Record<CivilDateField, string | null>;

  return {
    ...fields,
    ...dates,
    age: person.birthDate ? ageOn(person.birthDate) : null,
    organizationName: organization.name,
    admissionMethodName: admissionMethod?.name ?? null,
    family: familyMember
      ? {
          id: familyMember.family.id,
          name: familyMember.family.name,
          role: familyMember.role,
          members: familyMember.family.members.map((member) => ({
            personId: member.personId,
            name: member.person.name,
            preferredName: member.person.preferredName,
            role: member.role,
            age: member.person.birthDate ? ageOn(member.person.birthDate) : null,
          })),
        }
      : null,
    consent: consent
      ? {
          id: consent.id,
          method: consent.method,
          textVersion: consent.textVersion,
          givenAt: consent.givenAt.toISOString(),
          givenByPersonId: consent.givenByPersonId,
          givenByName: consent.givenBy?.name ?? null,
        }
      : null,
    missingFields: missing,
    incomplete: missing.length > 0,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

type PersonDto = ReturnType<typeof mapDetail>;

function mapListItem(person: PersonListItem) {
  return {
    id: person.id,
    name: person.name,
    preferredName: person.preferredName,
    sex: person.sex,
    birthDate: formatCivilDate(person.birthDate),
    age: person.birthDate ? ageOn(person.birthDate) : null,
    bond: person.bond,
    status: person.status,
    organizationId: person.organizationId,
    organizationName: person.organization.name,
    mobilePhone: person.mobilePhone,
    mobileIsWhatsapp: person.mobileIsWhatsapp,
    email: person.email,
    familyId: person.familyMember?.familyId ?? null,
    createdAt: person.createdAt.toISOString(),
  };
}

function auditEntry(
  action: string,
  organizationId: string,
  targetType: string,
  targetId: string,
  data: { before?: unknown; after?: unknown } = {},
): AuditEntry {
  return { organizationId, module: "PESSOAS", action, targetType, targetId, ...data };
}

function requirementsError(missing: MissingField[]) {
  const guardianRelated = missing.some((field) => field === "guardian" || field === "consent");
  return new AppError(
    400,
    guardianRelated ? "GUARDIAN_REQUIRED" : "BOND_REQUIREMENTS",
    guardianRelated
      ? `Menor de 18 anos precisa de responsável vinculado e consentimento dado por ele. Falta: ${describeMissing(missing)}.`
      : `Falta preencher: ${describeMissing(missing)}.`,
    { missingFields: missing },
  );
}

function cpfConflict(existing: { id: string; name: string }) {
  return new AppError(409, "CPF_CONFLICT", `Já existe pessoa com este CPF: ${existing.name}.`, {
    personId: existing.id,
  });
}

function invalidReference(message: string) {
  return new AppError(400, "INVALID_REFERENCE", message);
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Nome normalizado parecido: mesmo primeiro nome, ou um contido no outro.
function similarNames(a: string, b: string) {
  if (!a || !b) return false;
  return a.split(" ")[0] === b.split(" ")[0] || a.includes(b) || b.includes(a);
}

export class PersonService {
  constructor(
    private readonly repository: PersonRepository,
    private readonly lists: ChurchListRepository,
  ) {}

  async list(context: RequestContext, query: PersonListQuery) {
    const { items, total } = await this.repository.list(context.readOrganizationIds, query);
    return { items: items.map(mapListItem), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(context: RequestContext, id: string) {
    const person = await this.repository.findById(id, context.readOrganizationIds);
    if (!person) throw new PersonNotFoundError();
    return mapDetail(person);
  }

  // RF-C02: CPF igual bloqueia; email, celular ou nome parecido + mesmo nascimento avisam.
  // Só nas organizações que o usuário lê.
  async findDuplicates(context: RequestContext, query: DuplicateQuery) {
    const cpf = query.cpf && isValidCpf(query.cpf) ? normalizeCpf(query.cpf) : undefined;
    const email = query.email?.toLowerCase();
    const mobilePhone = (query.celular && normalizePhone(query.celular)) || undefined;
    const birthDate = query.nascimento ?? undefined;
    const name = query.nome ? normalizeSearchText(query.nome) : "";

    const candidates = await this.repository.findDuplicateCandidates(
      context.readOrganizationIds,
      { cpf, email, mobilePhone, birthDate },
      query.ignorar,
    );

    const items = candidates.flatMap((candidate) => {
      const reasons: string[] = [];
      if (cpf && candidate.cpf === cpf) reasons.push("CPF");
      if (email && candidate.email?.toLowerCase() === email) reasons.push("EMAIL");
      if (mobilePhone && candidate.mobilePhone === mobilePhone) reasons.push("CELULAR");
      if (
        birthDate &&
        candidate.birthDate?.getTime() === birthDate.getTime() &&
        similarNames(name, candidate.searchName)
      ) {
        reasons.push("NOME_NASCIMENTO");
      }
      if (reasons.length === 0) return [];

      return [
        {
          id: candidate.id,
          name: candidate.name,
          preferredName: candidate.preferredName,
          bond: candidate.bond,
          status: candidate.status,
          birthDate: formatCivilDate(candidate.birthDate),
          organizationId: candidate.organization.id,
          organizationName: candidate.organization.name,
          reasons,
          blocking: reasons.includes("CPF"),
        },
      ];
    });

    return { items };
  }

  // Cadastro rápido (RF-C01, RF-C04).
  async create(context: RequestContext, payload: PersonCreatePayload) {
    const { guardian, consent, organizationId: requestedOrganizationId, bond, ...fields } = payload;
    const organizationId = this.resolveCreateOrganization(context, requestedOrganizationId);
    const minor = isMinor(fields.birthDate);

    if ((minor || bond === "MEMBRO_EM_FORMACAO") && !guardian) throw requirementsError(["guardian"]);
    if (minor && !consent) throw requirementsError(["consent"]);

    const missing = missingFields({ ...fields, bond, hasGuardian: Boolean(guardian), hasConsent: Boolean(consent) });
    if (missing.length > 0) throw requirementsError(missing);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        await this.assertAdmissionMethod(context, fields.admissionMethodId, tx);
        if (fields.cpf) await this.assertCpfAvailable(context, fields.cpf, null, tx);

        const guardianPerson = guardian
          ? await this.resolveGuardian(context, guardian, organizationId, tx, audit)
          : null;

        // Criança sem endereço herda o do responsável (endereço compartilhado da família).
        const address =
          guardianPerson && !fields.postalCode && !fields.street
            ? {
                postalCode: guardianPerson.postalCode,
                street: guardianPerson.street,
                number: guardianPerson.number,
                complement: guardianPerson.complement,
                district: guardianPerson.district,
                city: guardianPerson.city,
                state: guardianPerson.state,
              }
            : {};

        const created = await this.repository.create(
          {
            ...fields,
            ...address,
            name: fields.name,
            bond,
            organizationId,
            searchName: normalizeSearchText(`${fields.name} ${fields.preferredName ?? ""}`),
          },
          tx,
        );

        if (guardianPerson) await this.linkToGuardianFamily(created.id, guardianPerson, tx, audit);

        if (consent) {
          const record = await this.repository.createConsent(
            {
              organizationId,
              personId: created.id,
              purpose: "CADASTRO",
              givenByPersonId: minor && guardianPerson ? guardianPerson.id : null,
              method: consent.method,
              textVersion: CONSENT_TEXT_VERSION,
              givenAt: consent.givenAt ?? parseCivilDate(todayCivil()),
              recordedByUserId: context.actor.userId,
            },
            tx,
          );
          await audit(auditEntry("registrar_consentimento", organizationId, "PersonConsent", record.id, { after: record }));
        }

        const person = mapDetail((await this.repository.findById(created.id, [organizationId], tx))!);
        await audit(auditEntry("criar", organizationId, "Person", person.id, { after: person }));
        return person;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, "CPF_CONFLICT", "Já existe pessoa com este CPF.");
      throw error;
    }
  }

  // Edição dos dados cadastrais. A obrigatoriedade por vínculo vale para novas edições:
  // não dá para tirar um dado exigido, mas cadastro migrado incompleto continua editável.
  async update(context: RequestContext, id: string, payload: PersonUpdatePayload) {
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.assertExists(context, id, tx);
        await this.assertAdmissionMethod(context, payload.admissionMethodId, tx);
        if (payload.cpf) await this.assertCpfAvailable(context, payload.cpf, id, tx);

        const changes = Object.fromEntries(
          Object.entries(payload).filter(([, value]) => value !== undefined),
        ) as PersonUpdatePayload;
        const current = requirementInput(existing);
        const before = new Set(missingFields(current));
        const worse = missingFields({ ...current, ...changes, name: changes.name ?? existing.name }).filter(
          (field) => !before.has(field),
        );
        if (worse.length > 0) throw requirementsError(worse);

        const name = changes.name ?? existing.name;
        const preferredName = changes.preferredName !== undefined ? changes.preferredName : existing.preferredName;

        const updated = mapDetail(
          await this.repository.update(
            id,
            { ...changes, searchName: normalizeSearchText(`${name} ${preferredName ?? ""}`) },
            tx,
          ),
        );
        await audit(
          auditEntry("editar", existing.organizationId, "Person", id, { before: mapDetail(existing), after: updated }),
        );
        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, "CPF_CONFLICT", "Já existe pessoa com este CPF.");
      throw error;
    }
  }

  // "Apagar registro" (RF-V05): só cadastro feito por engano, sem vínculos.
  async remove(context: RequestContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      const counts = await this.repository.countLinks(id, tx);
      const links = Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([key]) => key);

      if (links.length > 0) {
        throw new AppError(
          409,
          "PERSON_HAS_LINKS",
          "Esta pessoa tem vínculos (lançamentos, família, acesso ou histórico) e não pode ser apagada. Para registrar a saída, mude a situação.",
          { links },
        );
      }

      await this.repository.delete(id, tx);
      await audit(auditEntry("apagar_registro", existing.organizationId, "Person", id, { before: mapDetail(existing) }));
    });
  }

  private resolveCreateOrganization(context: RequestContext, requested: string | null | undefined) {
    if (!requested) return requireWriteOrganization(context);
    if (!context.readOrganizationIds.includes(requested)) {
      throw invalidReference("Congregação fora do seu acesso.");
    }
    return requested;
  }

  private async assertExists(context: RequestContext, id: string, db: Db) {
    const person = await this.repository.findById(id, context.readOrganizationIds, db);
    if (!person) throw new PersonNotFoundError();
    return person;
  }

  private async assertAdmissionMethod(context: RequestContext, id: string | null | undefined, db: Db) {
    if (!id) return;
    const item = await this.lists.findActiveItem(id, context.churchId, "FORMA_ADMISSAO", db);
    if (!item) throw invalidReference("Forma de admissão não encontrada nas listas da igreja.");
  }

  private async assertCpfAvailable(context: RequestContext, cpf: string, excludeId: string | null, db: Db) {
    const existing = await this.repository.findByCpf(cpf, context.readOrganizationIds, excludeId, db);
    if (existing) throw cpfConflict(existing);
  }

  private async resolveGuardian(
    context: RequestContext,
    guardian: GuardianPayload,
    organizationId: string,
    db: Db,
    audit: AuditWriter,
  ) {
    if ("personId" in guardian) {
      const person = await this.repository.findById(guardian.personId, context.readOrganizationIds, db);
      if (!person) throw invalidReference("Responsável não encontrado.");
      if (isMinor(person.birthDate)) {
        throw new AppError(400, "INVALID_GUARDIAN", "O responsável precisa ser maior de 18 anos.");
      }
      if (person.familyMember && !GUARDIAN_ROLES.includes(person.familyMember.role)) {
        throw new AppError(
          400,
          "INVALID_GUARDIAN",
          "Na família dele, o responsável precisa ter o papel de responsável ou cônjuge.",
        );
      }
      return person;
    }

    const bond: PersonBond = guardian.bond;
    const missing = missingFields({ ...guardian, bond, hasGuardian: false, hasConsent: false });
    if (missing.length > 0) {
      throw new AppError(400, "BOND_REQUIREMENTS", `Responsável: falta preencher ${describeMissing(missing)}.`, {
        missingFields: missing,
        target: "guardian",
      });
    }

    const created = await this.repository.create(
      {
        organizationId,
        name: guardian.name,
        bond,
        mobilePhone: guardian.mobilePhone,
        mobileIsWhatsapp: guardian.mobileIsWhatsapp,
        email: guardian.email,
        searchName: normalizeSearchText(guardian.name),
      },
      db,
    );
    await audit(auditEntry("criar", organizationId, "Person", created.id, { after: mapDetail(created) }));
    return created;
  }

  // Família do responsável (criada se ele ainda não tiver), com a criança como filho.
  private async linkToGuardianFamily(childId: string, guardian: PersonDetail, db: Db, audit: AuditWriter) {
    let familyId = guardian.familyMember?.familyId;

    if (!familyId) {
      const family = await this.repository.createFamily(guardian.organizationId, familyNameFor(guardian.name), db);
      await this.repository.addFamilyMember(family.id, guardian.id, "RESPONSAVEL", db);
      familyId = family.id;
      await audit(
        auditEntry("criar", guardian.organizationId, "Family", family.id, {
          after: { ...family, members: [{ personId: guardian.id, role: "RESPONSAVEL" }] },
        }),
      );
    }

    await this.repository.addFamilyMember(familyId, childId, "FILHO", db);
    await audit(
      auditEntry("adicionar_membro", guardian.organizationId, "Family", familyId, {
        after: { personId: childId, role: "FILHO" },
      }),
    );
  }
}

export type { PersonDto };

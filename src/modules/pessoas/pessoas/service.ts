import { Prisma, type PersonBond, type Receivable } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry, type AuditWriter } from "../../../lib/audit.js";
import { ageOn, formatCivilDate, parseCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { isValidCpf, normalizeCpf } from "../../../lib/cpf.js";
import { AppError } from "../../../lib/errors.js";
import { normalizePhone } from "../../../lib/phone.js";
import { normalizeSearchText } from "../../../lib/text.js";
import { mapFamilyMembers } from "../familias/service.js";
import type { ChurchListRepository } from "../listas/repository.js";
import { indicatorDays, JOURNEY_INDICATORS, loadJourneySettings } from "./jornada.js";
import type { PersonDetail, PersonListItem, PersonRepository } from "./repository.js";
import {
  describeMissing,
  familyNameFor,
  GUARDIAN_ROLES,
  isGuardianMember,
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
  PersonUpdateFields,
  PersonUpdatePayload,
} from "./schemas.js";

// Versão do texto de consentimento de cadastro (RF-P02). Mudou o texto, muda a versão.
export const CONSENT_TEXT_VERSION = "cadastro-2026-10";

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
  "bondSince",
] as const;

type CivilDateField = (typeof CIVIL_DATE_FIELDS)[number];

// Endereço e telefone fixo são do domicílio (RF-F03).
const FAMILY_SHARED_FIELDS = [
  "postalCode",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "secondaryPhone",
] as const;

// Mudou um destes, o contato conta como atualizado (indicador de contato desatualizado).
const CONTACT_FIELDS = ["mobilePhone", "secondaryPhone", "email", ...FAMILY_SHARED_FIELDS] as const;

const PERSON_BONDS: PersonBond[] = ["VISITANTE", "NOVO_CONVERTIDO", "CONGREGADO", "MEMBRO", "MEMBRO_EM_FORMACAO"];

// Desde quando a pessoa está no vínculo: a data que o define, ou hoje.
export function initialBondSince(
  bond: PersonBond,
  fields: { firstVisitDate?: Date | null; conversionDate?: Date | null; admissionDate?: Date | null },
) {
  const defining =
    bond === "VISITANTE" ? fields.firstVisitDate : bond === "NOVO_CONVERTIDO" ? fields.conversionDate : bond === "MEMBRO" ? fields.admissionDate : null;
  return defining ?? parseCivilDate(todayCivil());
}

function familyGuardianIds(person: PersonDetail) {
  const members = person.familyMember?.family.members ?? [];
  return members
    .filter(
      (member) =>
        member.personId !== person.id && isGuardianMember({ role: member.role, birthDate: member.person.birthDate }),
    )
    .map((member) => member.personId);
}

export function requirementInput(person: PersonDetail): RequirementInput {
  return {
    ...person,
    hasGuardian: familyGuardianIds(person).length > 0,
    hasConsent: person.consents.length > 0,
  };
}

// O que falta para cada outro vínculo (RF-V03): o modal de promover pede só isso.
function promotionRequirements(person: PersonDetail) {
  const current = requirementInput(person);
  const before = new Set(missingFields(current));
  return Object.fromEntries(
    PERSON_BONDS.filter((bond) => bond !== person.bond).map((bond) => [
      bond,
      missingFields({ ...current, bond }).filter((field) => !before.has(field)),
    ]),
  ) as Partial<Record<PersonBond, MissingField[]>>;
}

export function mapDetail(person: PersonDetail) {
  const {
    organization,
    admissionMethod,
    familyMember,
    consents,
    followUps,
    searchName: _searchName,
    ...fields
  } = person;
  const consent = consents[0] ?? null;
  const lastFollowUp = followUps[0] ?? null;
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
          members: mapFamilyMembers(familyMember.family.members),
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
    lastFollowUp: lastFollowUp
      ? {
          id: lastFollowUp.id,
          date: formatCivilDate(lastFollowUp.date),
          type: lastFollowUp.type,
          note: lastFollowUp.note,
          authorName: lastFollowUp.author.name,
        }
      : null,
    missingFields: missing,
    incomplete: missing.length > 0,
    promotionRequirements: promotionRequirements(person),
    contactUpdatedAt: person.contactUpdatedAt.toISOString(),
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

type PersonDto = ReturnType<typeof mapDetail>;

type ContributionRow = Receivable & { category: { name: string } | null; organization: { name: string } };

function mapContribution(receivable: ContributionRow) {
  return {
    id: receivable.id,
    description: receivable.description,
    source: receivable.source,
    organizationId: receivable.organizationId,
    organizationName: receivable.organization.name,
    categoryName: receivable.category?.name ?? null,
    dueDate: receivable.dueDate.toISOString(),
    amount: receivable.amount.toNumber(),
    status: receivable.status,
    settledAmount: receivable.settledAmount?.toNumber() ?? null,
    settledAt: receivable.settledAt?.toISOString() ?? null,
    settlementMethod: receivable.settlementMethod,
  };
}

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

export function auditEntry(
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

export function isUniqueViolation(error: unknown) {
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
    const settings = query.indicador ? await loadJourneySettings(context.churchId) : null;
    const { items, total } = await this.repository.list(context.readOrganizationIds, query, settings);
    return { items: items.map(mapListItem), total, page: query.page, pageSize: query.pageSize };
  }

  // Indicadores da jornada (RT-B13, RF-P10): só contadores, nas organizações que o usuário lê.
  async indicators(context: RequestContext) {
    const settings = await loadJourneySettings(context.churchId);
    const items = await Promise.all(
      JOURNEY_INDICATORS.map(async (key) => ({
        key,
        count: await this.repository.countIndicator(context.readOrganizationIds, key, settings),
        days: indicatorDays(key, settings),
      })),
    );
    return { items };
  }

  async getById(context: RequestContext, id: string) {
    const person = await this.repository.findById(id, context.readOrganizationIds);
    if (!person) throw new PersonNotFoundError();
    return mapDetail(person);
  }

  // Contribuições (RT-B04): endpoint separado do detalhe, com permissão própria.
  async contributions(context: RequestContext, id: string) {
    const person = await this.repository.findById(id, context.readOrganizationIds);
    if (!person) throw new PersonNotFoundError();

    const rows = await this.repository.listContributions(id, context.readOrganizationIds);
    const totalReceived = rows
      .filter((row) => row.status === "RECEBIDO")
      .reduce((sum, row) => sum.plus(row.settledAmount ?? row.amount), new Prisma.Decimal(0));
    return { items: rows.map(mapContribution), totalReceived: totalReceived.toNumber() };
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
            bondSince: initialBondSince(bond, fields),
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
    const { applyToFamily, ...fields } = payload;
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.assertExists(context, id, tx);
        await this.assertAdmissionMethod(context, fields.admissionMethodId, tx);
        if (fields.cpf) await this.assertCpfAvailable(context, fields.cpf, id, tx);

        const changes = Object.fromEntries(
          Object.entries(fields).filter(([, value]) => value !== undefined),
        ) as PersonUpdateFields;
        const current = requirementInput(existing);
        const before = new Set(missingFields(current));
        const worse = missingFields({ ...current, ...changes, name: changes.name ?? existing.name }).filter(
          (field) => !before.has(field),
        );
        if (worse.length > 0) throw requirementsError(worse);

        const name = changes.name ?? existing.name;
        const preferredName = changes.preferredName !== undefined ? changes.preferredName : existing.preferredName;
        const contactChanged = CONTACT_FIELDS.some(
          (field) => changes[field] !== undefined && changes[field] !== existing[field],
        );

        const updated = mapDetail(
          await this.repository.update(
            id,
            {
              ...changes,
              searchName: normalizeSearchText(`${name} ${preferredName ?? ""}`),
              ...(contactChanged ? { contactUpdatedAt: new Date() } : {}),
            },
            tx,
          ),
        );
        await audit(
          auditEntry("editar", existing.organizationId, "Person", id, { before: mapDetail(existing), after: updated }),
        );
        if (applyToFamily) await this.applyToFamily(context, existing, changes, tx, audit);
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

  // RF-F03: copia endereço e telefone fixo para os outros membros da família que o usuário enxerga,
  // com a mesma regra do "não piorar" do vínculo.
  private async applyToFamily(
    context: RequestContext,
    person: PersonDetail,
    changes: PersonUpdateFields,
    db: Db,
    audit: AuditWriter,
  ) {
    const shared: Partial<Record<(typeof FAMILY_SHARED_FIELDS)[number], string | null>> = {};
    for (const field of FAMILY_SHARED_FIELDS) {
      if (changes[field] !== undefined) shared[field] = changes[field];
    }
    if (Object.keys(shared).length === 0) return;

    const otherIds = (person.familyMember?.family.members ?? [])
      .map((member) => member.personId)
      .filter((personId) => personId !== person.id);
    const others = await this.repository.findManyByIds(otherIds, context.readOrganizationIds, db);
    if (others.length === 0) return;

    for (const existing of others) {
      const current = requirementInput(existing);
      const before = new Set(missingFields(current));
      const worse = missingFields({ ...current, ...shared }).filter((field) => !before.has(field));
      if (worse.length > 0) {
        throw new AppError(
          400,
          "BOND_REQUIREMENTS",
          `${existing.name} ficaria sem ${describeMissing(worse)}. Salve sem aplicar à família.`,
          { missingFields: worse, target: "family", personId: existing.id },
        );
      }
    }

    // Uma escrita só (a transação roda no pooler; muitas idas ao banco estouram o tempo dela).
    const contactUpdatedAt = new Date();
    await this.repository.updateMany(
      others.map((existing) => existing.id),
      { ...shared, contactUpdatedAt },
      db,
    );
    await audit(
      others.map((existing) =>
        auditEntry("editar", existing.organizationId, "Person", existing.id, {
          before: mapDetail(existing),
          after: mapDetail({ ...existing, ...shared, contactUpdatedAt }),
        }),
      ),
    );
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
        bondSince: initialBondSince(bond, {}),
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

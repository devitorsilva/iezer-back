import type { FamilyRole, PersonBond, Prisma } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { formatCivilDate, parseCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { AppError } from "../../../lib/errors.js";
import { createId } from "../../../lib/ids.js";
import { normalizeSearchText, slugify } from "../../../lib/text.js";
import { describeMissing, familyNameFor, GUARDIAN_ROLES, isGuardianMember, isMinor, missingFields } from "../pessoas/rules.js";
import { CONSENT_TEXT_VERSION, initialBondSince, isUniqueViolation, similarNames } from "../pessoas/service.js";
import {
  BOND_LABELS,
  buildTemplate,
  parseRow,
  readSheet,
  type AdmissionMethod,
  type ImportFields,
  type ParsedRow,
} from "./planilha.js";
import type { BasePerson, ImportRepository } from "./repository.js";
import type { ImportConfirmPayload, ImportPreviewPayload } from "./schemas.js";

// Declaração de quem importa (RF-I07, RF-P08). Mudou o texto, muda a versão.
export const IMPORT_DECLARATION_VERSION = "importacao-2026-10";
export const IMPORT_DECLARATION =
  "Declaro que a igreja tem o consentimento de cada pessoa desta planilha para o cadastro e, no caso de menores de 18 anos, o consentimento dado por um responsável, e que a igreja guarda as fichas assinadas.";

const IMPORT_DESCRIPTION = "Importação da planilha";

// Transação da confirmação: escritas em lote, mas o banco remoto é lento (~1–3 s por consulta).
const IMPORT_TIMEOUT = 120_000;

type RowAction = "criar" | "duplicado" | "repetida" | "recusada";
type DuplicateReason = "CPF" | "NOME_NASCIMENTO" | "NOME_CELULAR" | "NOME_EMAIL";

interface DuplicateMatch {
  person: BasePerson;
  reasons: DuplicateReason[];
  others: number;
}

// Responsável de um menor: pessoa da base ou outra linha (nova) da planilha.
type GuardianRef = { kind: "base"; person: BasePerson } | { kind: "row"; line: number };

interface AnalyzedRow extends ParsedRow {
  action: RowAction;
  warnings: string[];
  duplicate: DuplicateMatch | null;
  repeatedLine: number | null;
  guardianRef: GuardianRef | null;
}

interface Analysis {
  organizationId: string;
  organizationName: string;
  templateVersion: string;
  methods: AdmissionMethod[];
  rows: AnalyzedRow[];
}

const civilKey = (date: Date | undefined | null) => (date ? formatCivilDate(date) : null);

function pushTo<K, V>(map: Map<K, V[]>, key: K | null | undefined, value: V) {
  if (key === null || key === undefined) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const REASON_ORDER: DuplicateReason[] = ["CPF", "NOME_NASCIMENTO", "NOME_CELULAR", "NOME_EMAIL"];

// Família da pessoa já tem outro responsável maior de idade.
function familyHasGuardian(person: BasePerson) {
  const members = person.familyMember?.family.members ?? [];
  return members.some(
    (member) =>
      member.personId !== person.id && isGuardianMember({ role: member.role, birthDate: member.person.birthDate }),
  );
}

// Data civil vira "YYYY-MM-DD" e a forma de admissão vai pelo nome, como no detalhe da pessoa.
function personSnapshot(data: Record<string, unknown>, methods: Map<string, string>) {
  const skip = new Set(["id", "organizationId", "searchName", "contactUpdatedAt", "createdAt", "updatedAt"]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (skip.has(key) || value === undefined) continue;
    if (key === "admissionMethodId") {
      result.admissionMethodName = typeof value === "string" ? (methods.get(value) ?? null) : null;
      continue;
    }
    result[key] = value instanceof Date ? formatCivilDate(value) : value;
  }
  return result;
}

const CONTACT_FIELDS = [
  "mobilePhone",
  "secondaryPhone",
  "email",
  "postalCode",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
] as const;

const ADDRESS_FIELDS = ["postalCode", "street", "number", "complement", "district", "city", "state"] as const;

export class ImportService {
  constructor(private readonly repository: ImportRepository) {}

  // RF-I01: modelo da organização ativa, com as listas da igreja.
  async template(context: RequestContext) {
    const organizationId = requireWriteOrganization(context);
    const [organization, admissionMethods] = await Promise.all([
      this.repository.findOrganization(organizationId),
      this.repository.admissionMethods(context.churchId),
    ]);
    const buffer = await buildTemplate({
      organizationId,
      organizationName: organization!.name,
      admissionMethods,
    });
    return { buffer, filename: `modelo-pessoas-${slugify(organization!.name) || "igreja"}.xlsx` };
  }

  // RT-B10, etapa 1: lê e confere tudo, sem gravar.
  async preview(context: RequestContext, payload: ImportPreviewPayload) {
    const analysis = await this.analyze(context, payload.arquivo);
    const rows = analysis.rows.map((row) => this.mapRow(row, analysis.rows));
    const count = (action: RowAction) => analysis.rows.filter((row) => row.action === action).length;

    return {
      organizationId: analysis.organizationId,
      organizationName: analysis.organizationName,
      templateVersion: analysis.templateVersion,
      declaration: { text: IMPORT_DECLARATION, version: IMPORT_DECLARATION_VERSION },
      totals: {
        total: rows.length,
        novos: count("criar"),
        duplicados: count("duplicado"),
        repetidas: count("repetida"),
        recusadas: count("recusada"),
      },
      rows,
    };
  }

  // RT-B10, etapa 2: confere de novo (o servidor não guarda a prévia) e grava as linhas válidas
  // numa transação só. Duplicado sem decisão é pulado.
  async confirm(context: RequestContext, payload: ImportConfirmPayload) {
    const analysis = await this.analyze(context, payload.arquivo);
    const { organizationId, rows } = analysis;
    const methodNames = new Map(analysis.methods.map((item) => [item.id, item.name]));
    const byLine = new Map(rows.map((row) => [row.line, row]));
    const decision = (row: AnalyzedRow) => payload.decisoes[String(row.line)] ?? "pular";

    const creates = rows.filter((row) => row.action === "criar");
    const updates = rows.filter((row) => row.action === "duplicado" && decision(row) === "atualizar");
    if (creates.length + updates.length === 0) {
      throw new AppError(400, "NOTHING_TO_IMPORT", "Nenhuma linha para gravar: todas foram puladas ou recusadas.");
    }

    const today = parseCivilDate(todayCivil());
    const newIds = new Map(creates.map((row) => [row.line, createId()]));
    const guardianIdOf = (ref: GuardianRef) => (ref.kind === "base" ? ref.person.id : newIds.get(ref.line)!);

    // Endereço do responsável, herdado pela criança sem endereço (como no cadastro rápido).
    const guardianAddress = (ref: GuardianRef): Partial<ImportFields> => {
      const source: Partial<Record<(typeof ADDRESS_FIELDS)[number], string | null | undefined>> =
        ref.kind === "base" ? ref.person : byLine.get(ref.line)!.fields;
      return Object.fromEntries(
        ADDRESS_FIELDS.filter((field) => source[field]).map((field) => [field, source[field]]),
      ) as Partial<ImportFields>;
    };

    const peopleData: Prisma.PersonCreateManyInput[] = [];
    const auditEntries: AuditEntry[] = [];
    const entry = (
      action: string,
      targetType: string,
      targetId: string,
      data: { before?: unknown; after?: unknown; organizationId?: string } = {},
    ): AuditEntry => ({
      organizationId: data.organizationId ?? organizationId,
      module: "PESSOAS",
      action,
      targetType,
      targetId,
      description: IMPORT_DESCRIPTION,
      before: data.before,
      after: data.after,
    });

    for (const row of creates) {
      const id = newIds.get(row.line)!;
      const fields = { ...row.fields };
      if (row.guardianRef && !fields.postalCode && !fields.street) Object.assign(fields, guardianAddress(row.guardianRef));
      const bond = row.bond!;
      const data: Prisma.PersonCreateManyInput = {
        ...fields,
        id,
        organizationId,
        name: row.name,
        bond,
        bondSince: initialBondSince(bond, fields),
        searchName: normalizeSearchText(`${row.name} ${fields.preferredName ?? ""}`),
      };
      peopleData.push(data);
      auditEntries.push(
        entry("criar", "Person", id, {
          after: { ...personSnapshot(data, methodNames), organizationName: analysis.organizationName, status: "ATIVO" },
        }),
      );
    }

    const personUpdates: { id: string; data: Prisma.PersonUncheckedUpdateInput }[] = [];
    for (const row of updates) {
      const existing = row.duplicate!.person;
      const changes = Object.fromEntries(
        Object.entries({ ...row.fields, name: row.name }).filter(([key, value]) => {
          const current = existing[key as keyof BasePerson];
          return value instanceof Date ? civilKey(value) !== civilKey(current as Date | null) : value !== current;
        }),
      ) as ImportFields;
      if (Object.keys(changes).length === 0) continue;

      const name = changes.name ?? existing.name;
      const preferredName = changes.preferredName ?? existing.preferredName;
      const contactChanged = CONTACT_FIELDS.some((field) => changes[field] !== undefined);
      personUpdates.push({
        id: existing.id,
        data: {
          ...changes,
          searchName: normalizeSearchText(`${name} ${preferredName ?? ""}`),
          ...(contactChanged ? { contactUpdatedAt: new Date() } : {}),
        },
      });

      const before = Object.fromEntries(
        Object.keys(changes).map((key) => [key, existing[key as keyof BasePerson] ?? null]),
      );
      auditEntries.push(
        entry("editar", "Person", existing.id, {
          organizationId: existing.organizationId,
          before: personSnapshot(before, methodNames),
          after: personSnapshot(changes as Record<string, unknown>, methodNames),
        }),
      );
    }

    // Famílias: a criança entra na família do responsável, criada se ele ainda não tiver uma.
    const familiesData: Prisma.FamilyCreateManyInput[] = [];
    const membersData: Prisma.FamilyMemberCreateManyInput[] = [];
    const newFamilyMembers = new Map<string, { personId: string; role: FamilyRole }[]>();
    const familyOf = new Map<string, string>();

    const familyForGuardian = (ref: GuardianRef) => {
      const guardianId = guardianIdOf(ref);
      const known = familyOf.get(guardianId);
      if (known) return known;

      if (ref.kind === "base" && ref.person.familyMember) {
        familyOf.set(guardianId, ref.person.familyMember.familyId);
        return ref.person.familyMember.familyId;
      }

      const familyId = createId();
      const guardianName = ref.kind === "base" ? ref.person.name : byLine.get(ref.line)!.name;
      familiesData.push({
        id: familyId,
        organizationId: ref.kind === "base" ? ref.person.organizationId : organizationId,
        name: familyNameFor(guardianName),
        // RF-F08: o responsável é o primeiro a entrar.
        primaryContactPersonId: guardianId,
      });
      membersData.push({ familyId, personId: guardianId, role: "RESPONSAVEL" });
      newFamilyMembers.set(familyId, [{ personId: guardianId, role: "RESPONSAVEL" }]);
      familyOf.set(guardianId, familyId);
      return familyId;
    };

    const consentsData: Prisma.PersonConsentCreateManyInput[] = [];

    for (const row of [...creates, ...updates]) {
      const existing = row.action === "duplicado" ? row.duplicate!.person : null;
      const personId = existing?.id ?? newIds.get(row.line)!;
      const birthDate = row.fields.birthDate ?? existing?.birthDate ?? null;

      if (row.guardianRef && !existing?.familyMember) {
        const familyId = familyForGuardian(row.guardianRef);
        membersData.push({ familyId, personId, role: "FILHO" });
        const planned = newFamilyMembers.get(familyId);
        if (planned) planned.push({ personId, role: "FILHO" });
        else {
          const guardian = row.guardianRef.kind === "base" ? row.guardianRef.person : null;
          auditEntries.push(
            entry("adicionar_membro", "Family", familyId, {
              organizationId: guardian?.familyMember?.family.organizationId ?? organizationId,
              after: { personId, role: "FILHO" },
            }),
          );
        }
      }

      if (row.consent.given && !existing?.consents.length) {
        const consent = {
          id: createId(),
          organizationId,
          personId,
          purpose: "CADASTRO" as const,
          givenByPersonId: isMinor(birthDate) && row.guardianRef ? guardianIdOf(row.guardianRef) : null,
          method: "PLANILHA" as const,
          textVersion: CONSENT_TEXT_VERSION,
          givenAt: row.consent.date ?? today,
          recordedByUserId: context.actor.userId,
        };
        consentsData.push(consent);
        auditEntries.push(
          entry("registrar_consentimento", "PersonConsent", consent.id, {
            after: { ...consent, givenAt: formatCivilDate(consent.givenAt) },
          }),
        );
      }
    }

    for (const family of familiesData) {
      auditEntries.push(
        entry("criar", "Family", family.id!, {
          organizationId: family.organizationId,
          after: { name: family.name, members: newFamilyMembers.get(family.id!) },
        }),
      );
    }

    // Relatório final (RF-I08).
    const updatedLines = new Set(updates.map((row) => row.line));
    const report = rows.map((row) => {
      const messages = [...row.errors, ...row.warnings];
      if (row.action === "criar") {
        return { line: row.line, name: row.name, result: "criada" as const, personId: newIds.get(row.line)!, messages };
      }
      if (row.action === "duplicado" && updatedLines.has(row.line)) {
        return { line: row.line, name: row.name, result: "atualizada" as const, personId: row.duplicate!.person.id, messages };
      }
      if (row.action === "duplicado") {
        return {
          line: row.line,
          name: row.name,
          result: "pulada" as const,
          personId: row.duplicate!.person.id,
          messages: [`Já cadastrada: ${row.duplicate!.person.name}.`, ...messages],
        };
      }
      if (row.action === "repetida") {
        return {
          line: row.line,
          name: row.name,
          result: "pulada" as const,
          personId: null,
          messages: [`Repete a linha ${row.repeatedLine}.`, ...messages],
        };
      }
      return { line: row.line, name: row.name, result: "recusada" as const, personId: null, messages };
    });
    const total = (result: (typeof report)[number]["result"]) => report.filter((item) => item.result === result).length;
    const totals = {
      criadas: total("criada"),
      atualizadas: total("atualizada"),
      puladas: total("pulada"),
      recusadas: total("recusada"),
    };

    const importId = createId();
    const fileName = payload.nomeArquivo ?? "planilha.xlsx";
    auditEntries.push({
      organizationId,
      module: "PESSOAS",
      action: "importar",
      targetType: "PersonImport",
      targetId: importId,
      description: `${IMPORT_DESCRIPTION} ${fileName}`,
      after: {
        fileName,
        templateVersion: analysis.templateVersion,
        ...totals,
        refusedLines: report.filter((item) => item.result === "recusada").map((item) => item.line),
        declaration: IMPORT_DECLARATION,
        declarationVersion: IMPORT_DECLARATION_VERSION,
      },
      personIds: report.flatMap((item) =>
        (item.result === "criada" || item.result === "atualizada") && item.personId ? [item.personId] : [],
      ),
    });

    try {
      await runAudited(
        context.actor,
        async (tx, audit) => {
          await this.repository.createPeople(peopleData, tx);
          for (const update of personUpdates) await this.repository.updatePerson(update.id, update.data, tx);
          if (familiesData.length > 0) await this.repository.createFamilies(familiesData, tx);
          if (membersData.length > 0) await this.repository.addFamilyMembers(membersData, tx);
          if (consentsData.length > 0) await this.repository.createConsents(consentsData, tx);
          await audit(auditEntries);
        },
        { timeout: IMPORT_TIMEOUT },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          "IMPORT_CONFLICT",
          "A base mudou durante a importação (CPF ou família já usados). Envie a planilha de novo para gerar outra pré-visualização.",
        );
      }
      throw error;
    }

    return { importId, fileName, totals, rows: report };
  }

  private async analyze(context: RequestContext, file: Buffer): Promise<Analysis> {
    const organizationId = requireWriteOrganization(context);
    const sheet = await readSheet(file);

    if (sheet.organizationId !== organizationId) {
      const origin = sheet.organizationId ? await this.repository.findOrganization(sheet.organizationId) : null;
      const sameChurch = origin && (origin.id === context.churchId || origin.parentId === context.churchId);
      throw new AppError(
        400,
        "TEMPLATE_ORGANIZATION",
        sameChurch
          ? `Esta planilha foi gerada para ${origin.name}. Selecione essa organização no seletor ou baixe o modelo da organização ativa.`
          : "Esta planilha não foi gerada para a organização ativa. Baixe o modelo pelo iEzer com a organização certa selecionada.",
      );
    }

    const [organization, methods, people] = await Promise.all([
      this.repository.findOrganization(organizationId),
      this.repository.admissionMethods(context.churchId),
      this.repository.loadPeople(organizationId),
    ]);

    const rows: AnalyzedRow[] = sheet.rows.map((sheetRow) => {
      const parsed = parseRow(sheetRow, methods);
      return {
        ...parsed,
        action: parsed.errors.length > 0 ? "recusada" : "criar",
        warnings: [],
        duplicate: null,
        repeatedLine: null,
        guardianRef: null,
      };
    });
    const byLine = new Map(rows.map((row) => [row.line, row]));

    // Duplicados dentro do arquivo (RF-I06): vale a primeira linha.
    const fileByCpf = new Map<string, AnalyzedRow>();
    const fileByNameBirth = new Map<string, AnalyzedRow>();
    for (const row of rows) {
      if (row.action === "recusada") continue;
      const nameBirth = row.fields.birthDate ? `${normalizeSearchText(row.name)}|${civilKey(row.fields.birthDate)}` : null;
      const first = (row.fields.cpf && fileByCpf.get(row.fields.cpf)) || (nameBirth && fileByNameBirth.get(nameBirth));
      if (first) {
        row.action = "repetida";
        row.repeatedLine = first.line;
        continue;
      }
      if (row.fields.cpf) fileByCpf.set(row.fields.cpf, row);
      if (nameBirth) fileByNameBirth.set(nameBirth, row);
    }

    // Duplicados contra a base: CPF, ou nome parecido com mesmo nascimento, celular ou email.
    // Email ou celular sozinho não conta: famílias dividem.
    const baseByCpf = new Map<string, BasePerson>();
    const baseByBirth = new Map<string, BasePerson[]>();
    const baseByPhone = new Map<string, BasePerson[]>();
    const baseByEmail = new Map<string, BasePerson[]>();
    const baseByName = new Map<string, BasePerson[]>();
    for (const person of people) {
      if (person.cpf) baseByCpf.set(person.cpf, person);
      pushTo(baseByBirth, civilKey(person.birthDate), person);
      pushTo(baseByPhone, person.mobilePhone, person);
      if (person.secondaryPhone !== person.mobilePhone) pushTo(baseByPhone, person.secondaryPhone, person);
      pushTo(baseByEmail, person.email?.toLowerCase(), person);
      pushTo(baseByName, normalizeSearchText(person.name), person);
    }

    const claimed = new Map<string, number>();
    for (const row of rows) {
      if (row.action !== "criar" && row.action !== "recusada") continue;
      const match = this.findDuplicate(row, { baseByCpf, baseByBirth, baseByPhone, baseByEmail });
      if (!match) continue;
      row.duplicate = match;
      if (row.action === "recusada") continue;

      const claimedBy = claimed.get(match.person.id);
      if (claimedBy !== undefined) {
        row.action = "repetida";
        row.repeatedLine = claimedBy;
        continue;
      }
      claimed.set(match.person.id, row.line);
      row.action = "duplicado";
    }

    // Responsável (RF-P09): resolvido até não haver mais recusa em cascata.
    const needsGuardian = (row: AnalyzedRow) => {
      const existing = row.action === "duplicado" ? row.duplicate!.person : null;
      const birthDate = row.fields.birthDate ?? existing?.birthDate ?? null;
      const bond = existing?.bond ?? row.bond;
      return isMinor(birthDate) || bond === "MEMBRO_EM_FORMACAO";
    };

    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if ((row.action !== "criar" && row.action !== "duplicado") || !needsGuardian(row)) continue;
        const errors = this.resolveGuardian(row, rows, byLine, baseByCpf, baseByName, needsGuardian);
        if (errors.length > 0) {
          row.errors.push(...errors);
          row.action = "recusada";
          row.guardianRef = null;
          changed = true;
        }
      }
    }

    for (const row of rows) {
      if (row.action !== "criar" && row.action !== "duplicado") continue;
      const existing = row.action === "duplicado" ? row.duplicate!.person : null;

      if (!needsGuardian(row) && (row.guardian.cpf || row.guardian.name)) {
        row.warnings.push("Responsável ignorado: só vale para menores de 18 anos e Membro em formação.");
      }

      if (existing) {
        if (row.bond && row.bond !== existing.bond) {
          row.warnings.push(
            `Vínculo na planilha (${BOND_LABELS[row.bond]}) diferente do cadastro (${BOND_LABELS[existing.bond]}): não muda na importação.`,
          );
        }
        if (existing.status !== "ATIVO") row.warnings.push("O cadastro existente não está Ativo; a situação não muda.");
        if (row.duplicate!.others > 0) {
          row.warnings.push(`Há mais ${row.duplicate!.others} cadastro(s) parecido(s); confira antes de atualizar.`);
        }
        continue;
      }

      // Vínculo sem o mínimo entra como cadastro incompleto, como as pessoas migradas.
      const missing = missingFields({ ...row.fields, name: row.name, bond: row.bond!, hasGuardian: true, hasConsent: true });
      if (missing.length > 0) row.warnings.push(`Cadastro incompleto: falta ${describeMissing(missing)}.`);
    }

    for (const row of rows) row.warnings = [...new Set(row.warnings)];

    return {
      organizationId,
      organizationName: organization!.name,
      templateVersion: sheet.templateVersion,
      methods,
      rows,
    };
  }

  private findDuplicate(
    row: AnalyzedRow,
    index: {
      baseByCpf: Map<string, BasePerson>;
      baseByBirth: Map<string, BasePerson[]>;
      baseByPhone: Map<string, BasePerson[]>;
      baseByEmail: Map<string, BasePerson[]>;
    },
  ): DuplicateMatch | null {
    const { fields } = row;
    const name = normalizeSearchText(row.name);
    const matches = new Map<string, { person: BasePerson; reasons: Set<DuplicateReason> }>();
    const add = (person: BasePerson, reason: DuplicateReason) => {
      const match = matches.get(person.id) ?? { person, reasons: new Set<DuplicateReason>() };
      match.reasons.add(reason);
      matches.set(person.id, match);
    };
    const byName = (candidates: BasePerson[] | undefined, reason: DuplicateReason) => {
      for (const person of candidates ?? []) {
        // CPFs diferentes são pessoas diferentes.
        if (fields.cpf && person.cpf && person.cpf !== fields.cpf) continue;
        if (similarNames(name, person.searchName)) add(person, reason);
      }
    };

    const byCpf = fields.cpf ? index.baseByCpf.get(fields.cpf) : undefined;
    if (byCpf) add(byCpf, "CPF");
    byName(index.baseByBirth.get(civilKey(fields.birthDate) ?? ""), "NOME_NASCIMENTO");
    byName(fields.mobilePhone ? index.baseByPhone.get(fields.mobilePhone) : undefined, "NOME_CELULAR");
    byName(fields.email ? index.baseByEmail.get(fields.email) : undefined, "NOME_EMAIL");
    if (matches.size === 0) return null;

    const ranked = [...matches.values()].sort(
      (a, b) =>
        Number(b.reasons.has("CPF")) - Number(a.reasons.has("CPF")) || b.reasons.size - a.reasons.size,
    );
    const best = ranked[0];
    return {
      person: best.person,
      reasons: REASON_ORDER.filter((reason) => best.reasons.has(reason)),
      others: ranked.length - 1,
    };
  }

  // Acha o responsável pelo CPF ou pelo nome completo: primeiro na planilha, depois na base.
  private resolveGuardian(
    row: AnalyzedRow,
    rows: AnalyzedRow[],
    byLine: Map<number, AnalyzedRow>,
    baseByCpf: Map<string, BasePerson>,
    baseByName: Map<string, BasePerson[]>,
    needsGuardian: (row: AnalyzedRow) => boolean,
  ): string[] {
    const existing = row.action === "duplicado" ? row.duplicate!.person : null;
    const birthDate = row.fields.birthDate ?? existing?.birthDate ?? null;
    const minor = isMinor(birthDate);
    const errors: string[] = [];

    // Consentimento dado pelo responsável, obrigatório para menor (RF-C04).
    if (minor && !row.consent.given && !existing?.consents.length) {
      errors.push("Menor de 18 anos: o consentimento dado pelo responsável é obrigatório (Consentimento coletado = S).");
    }

    // Já está numa família: a família precisa ter responsável; a planilha não mexe nela.
    if (existing?.familyMember) {
      if (!familyHasGuardian(existing)) {
        errors.push("Já está numa família sem responsável maior de idade. Ajuste a família no perfil da pessoa.");
      } else if (row.guardian.cpf || row.guardian.name) {
        row.warnings.push("Já está numa família com responsável; o responsável da planilha foi ignorado.");
      }
      row.guardianRef = null;
      return errors;
    }

    const { cpf, name } = row.guardian;
    if (!cpf && !name) {
      errors.push(
        `${minor ? "Menor de 18 anos" : "Membro em formação"} precisa de responsável: informe o CPF ou o nome completo do responsável.`,
      );
      return errors;
    }

    const normalizedName = name ? normalizeSearchText(name) : null;
    const fileMatches = rows.filter(
      (other) =>
        other.line !== row.line &&
        (cpf ? other.fields.cpf === cpf : normalizeSearchText(other.name) === normalizedName),
    );
    // Linha repetida aponta para a primeira; linhas iguais contam uma vez.
    const targets = [
      ...new Set(fileMatches.map((other) => (other.action === "repetida" ? byLine.get(other.repeatedLine!)! : other))),
    ].filter((other) => other.line !== row.line);

    let ref: GuardianRef | null = null;
    let guardianBirth: Date | null = null;
    let guardianLabel = "";

    if (targets.length > 1) {
      errors.push("Há mais de uma linha com o nome do responsável. Informe o CPF dele.");
      return errors;
    }

    if (targets.length === 1) {
      const target = targets[0];
      if (target.duplicate) {
        ref = { kind: "base", person: target.duplicate.person };
      } else if (target.action === "recusada") {
        errors.push(`O responsável (linha ${target.line}) foi recusado.`);
        return errors;
      } else {
        if (needsGuardian(target)) {
          errors.push(`O responsável (linha ${target.line}) também precisa de responsável e não pode ser responsável.`);
          return errors;
        }
        ref = { kind: "row", line: target.line };
        guardianBirth = target.fields.birthDate ?? null;
        guardianLabel = `linha ${target.line}`;
      }
    } else {
      const candidates = cpf
        ? [baseByCpf.get(cpf)].filter((person): person is BasePerson => Boolean(person))
        : (baseByName.get(normalizedName!) ?? []);
      if (candidates.length === 0) {
        errors.push(
          `Responsável não encontrado (${cpf ? "CPF" : "nome"} não está no iEzer nem na planilha). Cadastre-o ou inclua-o numa linha.`,
        );
        return errors;
      }
      if (candidates.length > 1) {
        errors.push("Há mais de uma pessoa cadastrada com o nome do responsável. Informe o CPF dele.");
        return errors;
      }
      ref = { kind: "base", person: candidates[0] };
    }

    if (ref.kind === "base") {
      const person = ref.person;
      if (existing && person.id === existing.id) {
        errors.push("A pessoa não pode ser responsável por ela mesma.");
        return errors;
      }
      guardianBirth = person.birthDate;
      guardianLabel = person.name;
      if (person.familyMember && !GUARDIAN_ROLES.includes(person.familyMember.role)) {
        errors.push(`Na família de ${person.name}, o responsável precisa ter o papel de responsável ou cônjuge.`);
        return errors;
      }
    }

    if (isMinor(guardianBirth)) {
      errors.push(`O responsável (${guardianLabel}) precisa ser maior de 18 anos.`);
      return errors;
    }

    if (errors.length === 0) row.guardianRef = ref;
    return errors;
  }

  private mapRow(row: AnalyzedRow, rows: AnalyzedRow[]) {
    const duplicate = row.action === "duplicado" ? row.duplicate : null;
    const ref = row.guardianRef;
    const guardian = !ref
      ? null
      : ref.kind === "base"
        ? { personId: ref.person.id, name: ref.person.name, line: null }
        : { personId: null, name: rows.find((other) => other.line === ref.line)!.name, line: ref.line };

    return {
      line: row.line,
      name: row.name,
      bond: row.bond as PersonBond | null,
      birthDate: civilKey(row.fields.birthDate),
      action: row.action,
      errors: row.errors,
      warnings: row.warnings,
      repeatedLine: row.repeatedLine,
      guardian,
      duplicate: duplicate
        ? {
            personId: duplicate.person.id,
            name: duplicate.person.name,
            bond: duplicate.person.bond,
            status: duplicate.person.status,
            birthDate: civilKey(duplicate.person.birthDate),
            organizationName: duplicate.person.organization.name,
            reasons: duplicate.reasons,
          }
        : null,
    };
  }
}

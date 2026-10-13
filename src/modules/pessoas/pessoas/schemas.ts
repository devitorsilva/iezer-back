import { z } from "zod";
import { isCivilDate, parseCivilDate } from "../../../lib/civil-date.js";
import { isValidCpf, normalizeCpf } from "../../../lib/cpf.js";
import { normalizePhone } from "../../../lib/phone.js";

export const PERSON_BONDS = ["VISITANTE", "NOVO_CONVERTIDO", "CONGREGADO", "MEMBRO", "MEMBRO_EM_FORMACAO"] as const;
export const PERSON_STATUSES = ["ATIVO", "INATIVO", "TRANSFERIDO", "DESLIGADO", "FALECIDO"] as const;
const SEXES = ["MASCULINO", "FEMININO"] as const;
const MARITAL_STATUSES = ["SOLTEIRO", "CASADO", "UNIAO_ESTAVEL", "SEPARADO", "DIVORCIADO", "VIUVO"] as const;
const OTHER_DOCUMENT_TYPES = ["RG", "PASSAPORTE", "CERTIDAO_NASCIMENTO", "OUTRO"] as const;
const CONSENT_METHODS = ["PAPEL", "PLANILHA", "DIGITAL"] as const;

// Campos opcionais: ausente (undefined) não mexe; "" ou null limpa (vira null).
function blankToNull(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const nullable = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable().optional());

const text = (max: number) => nullable(z.string().max(max, `Use no máximo ${max} caracteres.`));

const civilDate = nullable(
  z
    .string()
    .refine(isCivilDate, "Data inválida (use AAAA-MM-DD).")
    .transform(parseCivilDate),
);

const phone = nullable(
  z
    .string()
    .refine((value) => normalizePhone(value) !== null, "Telefone inválido. Informe DDD e número.")
    .transform((value) => normalizePhone(value)!),
);

const cpf = nullable(
  z
    .string()
    .refine(isValidCpf, "CPF inválido.")
    .transform(normalizeCpf),
);

const email = nullable(z.email("Email inválido.").max(254).transform((value) => value.toLowerCase()));

const postalCode = nullable(
  z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 8, "CEP inválido."),
);

const state = nullable(
  z
    .string()
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z]{2}$/.test(value), "UF inválida."),
);

const id = nullable(z.string().cuid("Identificador inválido."));

// Campos cadastrais (PRD Pessoas › Campos por seção, fase MVP). Vínculo, situação e
// congregação mudam só por ações próprias (Sprint 9).
const personFields = {
  preferredName: text(80),
  sex: nullable(z.enum(SEXES, "Sexo inválido.")),
  birthDate: civilDate,
  maritalStatus: nullable(z.enum(MARITAL_STATUSES, "Estado civil inválido.")),
  cpf,
  otherDocumentType: nullable(z.enum(OTHER_DOCUMENT_TYPES, "Tipo de documento inválido.")),
  otherDocumentNumber: text(40),
  mobilePhone: phone,
  mobileIsWhatsapp: z.boolean().optional(),
  secondaryPhone: phone,
  email,
  postalCode,
  street: text(200),
  number: text(20),
  complement: text(100),
  district: text(100),
  city: text(100),
  state,
  firstVisitDate: civilDate,
  conversionDate: civilDate,
  presentationDate: civilDate,
  isBaptized: z.boolean().optional(),
  baptismDate: civilDate,
  baptismChurch: text(200),
  infantBaptism: z.boolean().optional(),
  professionOfFaithDate: civilDate,
  admissionMethodId: id,
  admissionDate: civilDate,
  originChurch: text(200),
  notes: text(2000),
};

const name = z.string().trim().min(2, "Nome é obrigatório.").max(150, "Use no máximo 150 caracteres.");

const consentSchema = z.object({
  method: z.enum(CONSENT_METHODS, "Forma de coleta inválida."),
  givenAt: civilDate,
});

// Responsável de menor (RF-C04): pessoa já cadastrada ou cadastrada na hora.
const guardianSchema = z.union([
  z.object({ personId: z.string().cuid("Responsável inválido.") }),
  z.object({
    name,
    bond: z.enum(PERSON_BONDS, "Vínculo inválido.").default("VISITANTE"),
    mobilePhone: phone,
    mobileIsWhatsapp: z.boolean().optional(),
    email,
  }),
]);

// Cadastro rápido (RF-C01). Os campos extras do vínculo escolhido (conversão, admissão,
// nascimento) vêm junto; o servidor confere o mínimo de cada estágio.
export const personCreateSchema = z.object({
  name,
  bond: z.enum(PERSON_BONDS, "Vínculo inválido."),
  // Sede ou congregação; sem ela, a organização ativa.
  organizationId: id,
  ...personFields,
  guardian: guardianSchema.optional(),
  consent: consentSchema.optional(),
});

export const personUpdateSchema = z.object({
  name: name.optional(),
  ...personFields,
  // RF-F03: endereço e telefone secundário enviados valem também para o resto da família.
  applyToFamily: z.boolean().optional(),
});

export const personParamsSchema = z.object({
  id: z.string().cuid(),
});

const csv = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.split(",").map((item) => item.trim()) : undefined),
    z.array(z.enum(values, message)).optional(),
  );

const optionalBoolean = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value === "" ? undefined : value),
  z.boolean("Use true ou false.").optional(),
);

const optionalInt = (min: number, max: number) =>
  z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().min(min).max(max).optional());

// RT-B01. Sem `situacao`, só ATIVO ("Inativo sai das listas padrão"); `situacao=todas` traz tudo.
export const personListQuerySchema = z.object({
  page: optionalInt(1, 100_000).default(1),
  pageSize: optionalInt(1, 100).default(20),
  q: z.preprocess(blankToNull, z.string().max(100).nullable().optional()),
  vinculo: csv(PERSON_BONDS, "Vínculo inválido."),
  situacao: csv(["todas", ...PERSON_STATUSES], "Situação inválida.").transform((values) =>
    values?.includes("todas") ? ("todas" as const) : (values as (typeof PERSON_STATUSES)[number][] | undefined),
  ),
  organizacao: z.preprocess(blankToNull, z.string().cuid().nullable().optional()),
  idadeMin: optionalInt(0, 150),
  idadeMax: optionalInt(0, 150),
  aniversarioMes: optionalInt(1, 12),
  batizado: optionalBoolean,
  familia: optionalBoolean,
  sexo: z.preprocess(blankToNull, z.enum(SEXES, "Sexo inválido.").nullable().optional()),
  semContato: optionalBoolean,
  sort: z
    .enum(["nome", "-nome", "cadastro", "-cadastro", "nascimento", "-nascimento", "aniversario"])
    .default("nome"),
});

// RF-C02: checagem durante a digitação. `ignorar` = a própria pessoa, ao editar.
export const duplicateQuerySchema = z.object({
  cpf: z.preprocess(blankToNull, z.string().nullable().optional()),
  email: z.preprocess(blankToNull, z.string().nullable().optional()),
  celular: z.preprocess(blankToNull, z.string().nullable().optional()),
  nome: z.preprocess(blankToNull, z.string().nullable().optional()),
  nascimento: civilDate,
  ignorar: z.preprocess(blankToNull, z.string().cuid().nullable().optional()),
});

export type PersonCreatePayload = z.infer<typeof personCreateSchema>;
export type PersonUpdatePayload = z.infer<typeof personUpdateSchema>;
export type PersonUpdateFields = Omit<PersonUpdatePayload, "applyToFamily">;
export type GuardianPayload = z.infer<typeof guardianSchema>;
export type ConsentPayload = z.infer<typeof consentSchema>;
export type PersonListQuery = z.infer<typeof personListQuerySchema>;
export type DuplicateQuery = z.infer<typeof duplicateQuerySchema>;

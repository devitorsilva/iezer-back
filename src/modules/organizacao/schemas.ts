import { z } from "zod";
import { isValidAnyCnpj, normalizeAnyCnpj } from "../../lib/cnpj.js";
import { normalizePhone } from "../../lib/phone.js";

export function blankToNull(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export const organizationName = z.string().trim().min(2, "Informe o nome.").max(120, "Use no máximo 120 caracteres.");

// Numérico ou alfanumérico (Receita, a partir de 2026).
export const cnpjValue = z.string().trim().refine(isValidAnyCnpj, "CNPJ inválido.").transform(normalizeAnyCnpj);

const cnpj = z.preprocess(blankToNull, cnpjValue.nullable().optional());

export const phoneValue = z
  .string({ error: "Informe o telefone." })
  .refine((value) => normalizePhone(value) !== null, "Telefone inválido. Informe DDD e número.")
  .transform((value) => normalizePhone(value)!);

export const contactPhone = z.preprocess(blankToNull, phoneValue.nullable().optional());

export const congregationParamsSchema = z.object({ id: z.string().cuid() });

export const updateChurchSchema = z.object({ name: organizationName.optional(), cnpj });

export const createCongregationSchema = z.object({ name: organizationName });

export const updateCongregationSchema = z.object({
  name: organizationName.optional(),
  isActive: z.boolean().optional(),
});

// Encarregado de LGPD, editável pela igreja (RF-OR03).
export const contactJobTitle = z.preprocess(blankToNull, z.string().max(120).nullable().optional());

export const contactEmail = z
  .string()
  .trim()
  .pipe(z.email("E-mail inválido.").max(254))
  .transform((value) => value.toLowerCase());

export const lgpdOfficerSchema = z.object({
  name: organizationName,
  jobTitle: contactJobTitle,
  email: contactEmail,
  phone: contactPhone,
});

// Dados de contato do responsável pela conta, pela equipe iEzer. Trocar a pessoa (o nome) exige
// documento (RF-BO25, Sprint 18).
export const accountOwnerContactSchema = z.object({
  jobTitle: contactJobTitle,
  email: contactEmail,
  phone: contactPhone,
});

export type UpdateChurchInput = z.infer<typeof updateChurchSchema>;
export type CreateCongregationInput = z.infer<typeof createCongregationSchema>;
export type UpdateCongregationInput = z.infer<typeof updateCongregationSchema>;
export type LgpdOfficerInput = z.infer<typeof lgpdOfficerSchema>;
export type AccountOwnerContactInput = z.infer<typeof accountOwnerContactSchema>;

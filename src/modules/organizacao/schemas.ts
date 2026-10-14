import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "../../lib/cnpj.js";
import { normalizePhone } from "../../lib/phone.js";

function blankToNull(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const name = z.string().trim().min(2, "Informe o nome.").max(120, "Use no máximo 120 caracteres.");

const cnpj = z.preprocess(
  blankToNull,
  z.string().refine(isValidCnpj, "CNPJ inválido.").transform(normalizeCnpj).nullable().optional(),
);

const phone = z.preprocess(
  blankToNull,
  z
    .string()
    .refine((value) => normalizePhone(value) !== null, "Telefone inválido. Informe DDD e número.")
    .transform((value) => normalizePhone(value)!)
    .nullable()
    .optional(),
);

export const congregationParamsSchema = z.object({ id: z.string().cuid() });

export const updateChurchSchema = z.object({ name: name.optional(), cnpj });

export const createCongregationSchema = z.object({ name });

export const updateCongregationSchema = z.object({
  name: name.optional(),
  isActive: z.boolean().optional(),
});

// Encarregado de LGPD, editável pela igreja (RF-OR03).
export const lgpdOfficerSchema = z.object({
  name,
  jobTitle: z.preprocess(blankToNull, z.string().max(120).nullable().optional()),
  email: z
    .string()
    .trim()
    .pipe(z.email("E-mail inválido.").max(254))
    .transform((value) => value.toLowerCase()),
  phone,
});

export type UpdateChurchInput = z.infer<typeof updateChurchSchema>;
export type CreateCongregationInput = z.infer<typeof createCongregationSchema>;
export type UpdateCongregationInput = z.infer<typeof updateCongregationSchema>;
export type LgpdOfficerInput = z.infer<typeof lgpdOfficerSchema>;

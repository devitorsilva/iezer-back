import { z } from "zod";
import { isValidAnyCnpj } from "../../../lib/cnpj.js";
import { isValidCpf } from "../../../lib/cpf.js";

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
  },
  z.string().optional(),
);

export const supplierPayloadSchema = z.object({
  name: z.string().trim().min(2, "Nome é obrigatório."),
  legalName: optionalTrimmedString,
  // CPF ou CNPJ (numérico ou alfanumérico), gravado como veio; o dígito verificador é conferido.
  cnpj: z
    .string()
    .trim()
    .min(1, "CPF ou CNPJ é obrigatório.")
    .refine((value) => isValidCpf(value) || isValidAnyCnpj(value), "CPF ou CNPJ inválido."),
  email: optionalTrimmedString.pipe(z.email("Email inválido.").optional()),
  phone: optionalTrimmedString,
  pixKey: optionalTrimmedString,
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const supplierParamsSchema = z.object({
  id: z.string().cuid(),
});

export type SupplierPayload = z.infer<typeof supplierPayloadSchema>;

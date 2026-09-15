import { z } from "zod";

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
  cnpj: z.string().trim().min(14, "CNPJ é obrigatório."),
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

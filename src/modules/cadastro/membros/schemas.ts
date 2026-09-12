import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
  },
  z.string().optional(),
);

export const memberPayloadSchema = z.object({
  name: z.string().trim().min(2, "Nome é obrigatório."),
  document: optionalTrimmedString,
  email: optionalTrimmedString.pipe(z.email("Email inválido.").optional()),
  phone: optionalTrimmedString,
  cellName: optionalTrimmedString,
  birthDate: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.date().optional(),
  ),
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const memberParamsSchema = z.object({
  id: z.string().cuid(),
});

export type MemberPayload = z.infer<typeof memberPayloadSchema>;

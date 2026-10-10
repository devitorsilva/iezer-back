import { z } from "zod";
import { isCivilDate, parseCivilDate } from "../../../lib/civil-date.js";

// Formato antigo do cadastro de membros, mantido só até a Sprint 5 (o front passa a usar /pessoas).
const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
  },
  z.string().optional(),
);

// Aceita "AAAA-MM-DD" ou data ISO; ISO vira o dia mais próximo em UTC, como na migração.
const legacyBirthDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .union([
      z.string().refine(isCivilDate).transform(parseCivilDate),
      z.coerce.date().transform((date) => parseCivilDate(new Date(date.getTime() + 12 * 3_600_000).toISOString().slice(0, 10))),
    ], "Data inválida.")
    .optional(),
);

export const memberPayloadSchema = z.object({
  name: z.string().trim().min(2, "Nome é obrigatório."),
  document: optionalTrimmedString,
  email: optionalTrimmedString.pipe(z.email("Email inválido.").optional()),
  phone: optionalTrimmedString,
  cellName: optionalTrimmedString,
  birthDate: legacyBirthDate,
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const memberParamsSchema = z.object({
  id: z.string().cuid(),
});

export type MemberPayload = z.infer<typeof memberPayloadSchema>;

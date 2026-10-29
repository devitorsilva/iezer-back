import { z } from "zod";
import { isCivilDate } from "../../../lib/civil-date.js";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const optionalInt = (min: number, max: number) => optional(z.coerce.number().int().min(min).max(max));
const civilDate = optional(z.string().refine(isCivilDate, "Data inválida (use AAAA-MM-DD)."));

const page = { page: optionalInt(1, 100_000).default(1), pageSize: optionalInt(1, 100).default(25) };

const period = <T extends { de?: string; ate?: string }>(value: T) => !value.de || !value.ate || value.de <= value.ate;
const periodError = { message: "A data inicial precisa ser anterior à final.", path: ["ate"] };

// Auditoria interna (RF-BO51): membro da equipe, igreja, ação e período.
export const internalAuditQuerySchema = z
  .object({
    membro: optional(z.string().cuid("Membro inválido.")),
    igreja: optional(z.string().cuid("Igreja inválida.")),
    acao: optional(z.string().max(60)),
    de: civilDate,
    ate: civilDate,
    ...page,
  })
  .refine(period, periodError);

// Aba Histórico da igreja (RF-BO15): o que a equipe fez nela, com os mesmos filtros menos a igreja.
export const churchHistoryQuerySchema = z
  .object({
    membro: optional(z.string().cuid("Membro inválido.")),
    acao: optional(z.string().max(60)),
    de: civilDate,
    ate: civilDate,
    ...page,
  })
  .refine(period, periodError);

export type InternalAuditQuery = z.infer<typeof internalAuditQuerySchema>;
export type ChurchHistoryQuery = z.infer<typeof churchHistoryQuerySchema>;

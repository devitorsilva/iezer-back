import { ModuleKey } from "@prisma/client";
import { z } from "zod";
import { isCivilDate } from "../../../lib/civil-date.js";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const optionalInt = (min: number, max: number) => optional(z.coerce.number().int().min(min).max(max));
const civilDate = optional(z.string().refine(isCivilDate, "Data inválida (use AAAA-MM-DD)."));

// Filtros da Auditoria (RF-LP02): autor, pessoa afetada, módulo, ação, organização, período
// e "Suporte iEzer".
export const auditFiltersSchema = z
  .object({
    autor: optional(z.string().cuid("Autor inválido.")),
    pessoa: optional(z.string().cuid("Pessoa inválida.")),
    modulo: optional(z.enum(ModuleKey, "Módulo inválido.")),
    acao: optional(z.string().max(60)),
    organizacao: optional(z.string().cuid("Organização inválida.")),
    de: civilDate,
    ate: civilDate,
    suporte: optional(z.enum(["true", "false"]).transform((value) => value === "true")),
  })
  .refine((value) => !value.de || !value.ate || value.de <= value.ate, {
    message: "A data inicial precisa ser anterior à final.",
    path: ["ate"],
  });

export const auditListQuerySchema = auditFiltersSchema.and(
  z.object({
    page: optionalInt(1, 100_000).default(1),
    pageSize: optionalInt(1, 100).default(25),
  }),
);

export const personHistoryQuerySchema = z.object({
  page: optionalInt(1, 100_000).default(1),
  pageSize: optionalInt(1, 100).default(20),
});

export type AuditFilters = z.infer<typeof auditFiltersSchema>;
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
export type PersonHistoryQuery = z.infer<typeof personHistoryQuerySchema>;

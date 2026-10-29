import { SupportEmergencyKind } from "@prisma/client";
import { z } from "zod";
import { SUPPORT_DEFAULT_HOURS, SUPPORT_EMERGENCY_MAX_HOURS, SUPPORT_MAX_HOURS } from "../../../lib/support.js";
import { grantFieldsSchema, hours, requireWriteJustification } from "../../acesso/suporte/schemas.js";

export { grantParamsSchema } from "../../acesso/suporte/schemas.js";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

// Situações da lista (RF-BO37), com EXPIRADO calculado.
export const SUPPORT_REQUEST_STATUSES = [
  "AGUARDANDO_IEZER",
  "PENDENTE",
  "ATIVO",
  "EXPIRADO",
  "RECUSADO",
  "REVOGADO",
  "ENCERRADO",
  "CANCELADO",
] as const;

export const listRequestsQuerySchema = z.object({
  igreja: z.preprocess(blankToUndefined, z.string().cuid().optional()),
  situacao: z.preprocess(blankToUndefined, z.enum(SUPPORT_REQUEST_STATUSES, "Situação inválida.").optional()),
});

// Pedido de acesso (RF-BO34): sempre ligado a um chamado; 24h por padrão, no máximo 72h.
export const requestGrantSchema = grantFieldsSchema
  .extend({
    churchId: z.string().cuid("Escolha a igreja."),
    ticket: z.string("Informe o chamado.").trim().min(1, "Informe o chamado.").max(80),
    durationHours: hours(SUPPORT_MAX_HOURS).default(SUPPORT_DEFAULT_HOURS),
  })
  .superRefine(requireWriteJustification);

// Emergência (RF-BO39): no máximo 24h, aprovada por outro Administrador iEzer.
export const emergencySchema = grantFieldsSchema
  .extend({
    churchId: z.string().cuid("Escolha a igreja."),
    kind: z.enum(SupportEmergencyKind, "Escolha o tipo de emergência."),
    durationHours: hours(SUPPORT_EMERGENCY_MAX_HOURS).default(SUPPORT_EMERGENCY_MAX_HOURS),
  })
  .superRefine(requireWriteJustification);

export const closeGrantSchema = z.object({
  reason: optionalText(500),
});

export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;
export type RequestGrantInput = z.infer<typeof requestGrantSchema>;
export type EmergencyInput = z.infer<typeof emergencySchema>;
export type CloseGrantInput = z.infer<typeof closeGrantSchema>;

import { z } from "zod";
import { SUPPORT_DEFAULT_HOURS, SUPPORT_MAX_HOURS, SUPPORT_SCOPES } from "../../../lib/support.js";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const hours = (max: number) =>
  z.coerce
    .number()
    .int("Informe o prazo em horas inteiras.")
    .min(1, "O prazo mínimo é de 1 hora.")
    .max(max, `O prazo máximo é de ${max} horas.`);

export const grantParamsSchema = z.object({
  id: z.string().cuid(),
});

// Campos comuns a pedido, autorização e emergência (RF-SP01, RF-SP02).
export const grantFieldsSchema = z.object({
  ticket: optionalText(80),
  reason: z.string().trim().min(5, "Descreva o motivo.").max(500, "Use no máximo 500 caracteres."),
  scope: z.array(z.enum(SUPPORT_SCOPES, "Módulo inválido.")).min(1, "Escolha ao menos um módulo."),
  canWrite: z.boolean().default(false),
  writeJustification: optionalText(500),
});

// Escrita só com justificativa (RF-SP02).
export function requireWriteJustification(value: { canWrite: boolean; writeJustification?: string }, ctx: z.RefinementCtx) {
  if (value.canWrite && !value.writeJustification) {
    ctx.addIssue({
      code: "custom",
      message: "Justifique por que o suporte precisa alterar dados.",
      path: ["writeJustification"],
    });
  }
}

// O admin autoriza por conta própria ao abrir o chamado (RF-SP01, segundo caminho).
export const authorizeGrantSchema = grantFieldsSchema
  .extend({ durationHours: hours(SUPPORT_MAX_HOURS).default(SUPPORT_DEFAULT_HOURS) })
  .superRefine(requireWriteJustification);

// Aprovar um pedido: o admin pode encurtar o prazo pedido.
export const approveGrantSchema = z.object({
  durationHours: hours(SUPPORT_MAX_HOURS).optional(),
});

export const refuseGrantSchema = z.object({
  reason: optionalText(500),
});

export type AuthorizeGrantInput = z.infer<typeof authorizeGrantSchema>;
export type ApproveGrantInput = z.infer<typeof approveGrantSchema>;
export type RefuseGrantInput = z.infer<typeof refuseGrantSchema>;

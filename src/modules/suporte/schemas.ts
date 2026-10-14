import { SupportEmergencyKind } from "@prisma/client";
import { z } from "zod";
import { normalizePhone } from "../../lib/phone.js";
import { SUPPORT_DEFAULT_HOURS, SUPPORT_EMERGENCY_MAX_HOURS, SUPPORT_MAX_HOURS } from "../../lib/support.js";
import { grantFieldsSchema, hours, requireWriteJustification } from "../acesso/suporte/schemas.js";

export { grantParamsSchema } from "../acesso/suporte/schemas.js";

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const churchParamsSchema = z.object({
  churchId: z.string().cuid(),
});

export const churchSearchSchema = z.object({
  busca: optionalText(100),
});

export const grantListQuerySchema = z.object({
  igreja: z.preprocess(blankToUndefined, z.string().cuid().optional()),
});

// Pedido pelo back-office, sempre ligado a um chamado (RF-SP01).
export const requestGrantSchema = grantFieldsSchema
  .extend({
    churchId: z.string().cuid("Escolha a igreja."),
    ticket: z.string("Informe o chamado.").trim().min(1, "Informe o chamado.").max(80),
    durationHours: hours(SUPPORT_MAX_HOURS).default(SUPPORT_DEFAULT_HOURS),
  })
  .superRefine(requireWriteJustification);

// Emergência: prazo máximo de 24h, dupla aprovação interna (RF-SP09).
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

// Recuperação de admin (RF-SP10): quem será o admin e como a identidade do pedido foi conferida.
export const recoverAdminSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo.").max(120),
  email: z.email("E-mail inválido.").transform((value) => value.trim().toLowerCase()),
  mobilePhone: z.preprocess(
    blankToUndefined,
    z
      .string()
      .refine((value) => normalizePhone(value) !== null, "Telefone inválido.")
      .transform((value) => normalizePhone(value)!)
      .optional(),
  ),
  verification: z
    .string()
    .trim()
    .min(10, "Descreva como a identidade foi conferida (documento, contato cadastrado, ata).")
    .max(1000),
});

export type RequestGrantInput = z.infer<typeof requestGrantSchema>;
export type EmergencyInput = z.infer<typeof emergencySchema>;
export type CloseGrantInput = z.infer<typeof closeGrantSchema>;
export type RecoverAdminInput = z.infer<typeof recoverAdminSchema>;

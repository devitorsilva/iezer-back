import { z } from "zod";
import { isCivilDate, parseCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { civilDate, name, nullable, PERSON_BONDS, text } from "../pessoas/schemas.js";

const FOLLOW_UP_TYPES = ["LIGACAO", "VISITA", "MENSAGEM", "CONVERSA"] as const;

// Data do evento (RF-V02): obrigatória e nunca no futuro.
const eventDate = z
  .string("Informe a data.")
  .refine(isCivilDate, "Data inválida (use AAAA-MM-DD).")
  .refine((value) => value <= todayCivil(), "A data não pode ser no futuro.")
  .transform(parseCivilDate);

const note = text(500);

const reasonId = z.string("Escolha o motivo.").cuid("Escolha o motivo.");

// Promover vínculo (RF-V03): o vínculo novo e só os campos que faltam para ele.
export const promoteSchema = z.object({
  bond: z.enum(PERSON_BONDS, "Vínculo inválido."),
  date: eventDate,
  note,
  name: name.optional(),
  birthDate: civilDate,
  conversionDate: civilDate,
  admissionMethodId: nullable(z.string().cuid("Forma de admissão inválida.")),
  admissionDate: civilDate,
});

export const statusWithReasonSchema = z.object({ date: eventDate, reasonId, note });

export const statusSchema = z.object({ date: eventDate, note });

// RF-V04: congregação do iEzer (transferência interna) ou outra igreja.
export const transferSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("INTERNA"),
    date: eventDate,
    note,
    organizationId: z.string("Escolha a congregação.").cuid("Escolha a congregação."),
  }),
  z.object({
    kind: z.literal("EXTERNA"),
    date: eventDate,
    note,
    churchName: z.string("Informe a igreja de destino.").trim().min(2, "Informe a igreja de destino.").max(200),
    letterIssued: z.boolean().default(false),
  }),
]);

// RF-V06: acompanhamento com data, tipo e observação curta; autor automático.
export const followUpSchema = z.object({
  date: eventDate,
  type: z.enum(FOLLOW_UP_TYPES, "Tipo de acompanhamento inválido."),
  note,
});

export type PromotePayload = z.infer<typeof promoteSchema>;
export type StatusWithReasonPayload = z.infer<typeof statusWithReasonSchema>;
export type StatusPayload = z.infer<typeof statusSchema>;
export type TransferPayload = z.infer<typeof transferSchema>;
export type FollowUpPayload = z.infer<typeof followUpSchema>;

import { z } from "zod";
import { addressFields } from "../pessoas/schemas.js";

export const FAMILY_ROLES = ["RESPONSAVEL", "CONJUGE", "FILHO", "OUTRO"] as const;

const role = z.enum(FAMILY_ROLES, "Papel inválido.");
const personId = z.string().cuid("Pessoa inválida.");
const name = z.string().trim().min(2, "Nome da família é obrigatório.").max(150, "Use no máximo 150 caracteres.");

const member = z.object({ personId, role });

// RF-F01: família como domicílio. Sem nome, vira "Família <sobrenome>" do primeiro responsável.
export const familyCreateSchema = z.object({
  name: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), name.optional()),
  members: z
    .array(member)
    .min(1, "Informe ao menos uma pessoa.")
    .max(30, "Use no máximo 30 pessoas.")
    .refine(
      (members) => new Set(members.map((item) => item.personId)).size === members.length,
      "A mesma pessoa aparece duas vezes.",
    ),
});

export const familyUpdateSchema = z.object({ name });

// `useFamilyAddress`: copia o endereço do domicílio (o do contato principal) para quem entra (RF-F03).
export const familyMemberSchema = member.extend({ useFamilyAddress: z.boolean().optional() });

// RF-F08: qualquer membro, inclusive menor (pode ser o único da família na igreja).
export const familyPrimaryContactSchema = z.object({ personId });

// RF-F03: "Atualizar endereço". Grava o endereço só em quem foi marcado; campo ausente limpa.
export const familyAddressSchema = z.object({
  ...addressFields,
  aplicarA: z
    .array(personId)
    .min(1, "Marque ao menos uma pessoa.")
    .max(30, "Use no máximo 30 pessoas.")
    .refine((ids) => new Set(ids).size === ids.length, "A mesma pessoa aparece duas vezes."),
});

export const familyMemberUpdateSchema = z.object({ role });

export const familyParamsSchema = z.object({
  id: z.string().cuid(),
});

export const familyMemberParamsSchema = z.object({
  id: z.string().cuid(),
  personId: z.string().cuid(),
});

export type FamilyCreatePayload = z.infer<typeof familyCreateSchema>;
export type FamilyUpdatePayload = z.infer<typeof familyUpdateSchema>;
export type FamilyMemberPayload = z.infer<typeof familyMemberSchema>;
export type FamilyPrimaryContactPayload = z.infer<typeof familyPrimaryContactSchema>;
export type FamilyAddressPayload = z.infer<typeof familyAddressSchema>;
export type FamilyMemberUpdatePayload = z.infer<typeof familyMemberUpdateSchema>;

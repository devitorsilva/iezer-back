import { AccountDocumentType, OrganizationStatus } from "@prisma/client";
import { z } from "zod";
import { isCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { MAX_DOCUMENT_BYTES } from "../../../lib/storage.js";
import {
  blankToNull,
  cnpjValue,
  contactEmail,
  contactJobTitle,
  lgpdOfficerSchema,
  organizationName,
  phoneValue,
} from "../../organizacao/schemas.js";

const personName = z.string().trim().min(2, "Informe o nome.").max(120, "Use no máximo 120 caracteres.");

export const churchParamsSchema = z.object({ id: z.string().cuid() });

export const congregationParamsSchema = z.object({ id: z.string().cuid(), congregationId: z.string().cuid() });

export const inviteParamsSchema = z.object({ id: z.string().cuid(), inviteId: z.string().cuid() });

export const listChurchesQuerySchema = z.object({
  busca: z.preprocess(blankToNull, z.string().max(120).nullable().optional()),
  situacao: z.preprocess(blankToNull, z.enum(OrganizationStatus).nullable().optional()),
});

// "Nova igreja" (RF-BO12). CNPJ obrigatório, numérico ou alfanumérico.
export const createChurchSchema = z.object({
  name: organizationName,
  cnpj: cnpjValue,
  congregations: z.array(organizationName).max(50, "Cadastre no máximo 50 congregações por vez.").default([]),
  accountOwner: z.object({
    name: personName,
    jobTitle: contactJobTitle,
    email: contactEmail,
    phone: z.preprocess(blankToNull, phoneValue),
  }),
  lgpdOfficer: z.preprocess((value) => value ?? undefined, lgpdOfficerSchema.optional()),
  admin: z.object({ name: personName, email: contactEmail }),
});

// Ações sem acesso aos dados (RF-BO32): motivo sempre, chamado opcional.
export const teamActionSchema = z.object({
  reason: z.string().trim().min(5, "Descreva o motivo (pelo menos 5 caracteres).").max(500),
  ticket: z.preprocess(blankToNull, z.string().max(60, "Use no máximo 60 caracteres.").nullable().optional()),
});

export const documentParamsSchema = z.object({ id: z.string().cuid(), documentId: z.string().cuid() });

const reason = z.string().trim().min(5, "Descreva o motivo (pelo menos 5 caracteres).").max(500);

// Situação da igreja (RF-BO19 a RF-BO21): suspender e reativar exigem motivo; ativar, não.
export const activateChurchSchema = z.object({ reason: z.preprocess(blankToNull, reason.nullable().optional()) });
export const churchStatusReasonSchema = z.object({ reason });

// Anexo em base64 no JSON (como a importação). O tipo é conferido pelo conteúdo no serviço.
export const DOCUMENT_BODY_LIMIT = Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 64 * 1024;

const documentContent = z
  .string("Anexe o documento.")
  .min(1, "Anexe o documento.")
  .transform((value) => Buffer.from(value.replace(/^data:[^,]*,/, ""), "base64"))
  .refine((buffer) => buffer.length > 0, "Anexe o documento.")
  .refine((buffer) => buffer.length <= MAX_DOCUMENT_BYTES, "O arquivo passa de 10 MB.");

// Troca do responsável pela conta (RF-BO25): novo responsável, documento e anexo.
export const changeAccountOwnerSchema = z.object({
  newOwner: z.object({
    name: personName,
    jobTitle: contactJobTitle,
    email: contactEmail,
    phone: z.preprocess(blankToNull, phoneValue),
  }),
  document: z.object({
    type: z.enum(AccountDocumentType, "Escolha o tipo do documento."),
    date: z
      .string("Informe a data do documento.")
      .refine(isCivilDate, "Data inválida (use AAAA-MM-DD).")
      .refine((value) => value <= todayCivil(), "A data do documento não pode ser futura."),
    minutesNumber: z.preprocess(blankToNull, z.string().max(60, "Use no máximo 60 caracteres.").nullable().optional()),
  }),
  file: z.object({
    name: z.string("Anexe o documento.").trim().min(1, "Anexe o documento.").max(200),
    content: documentContent,
  }),
});

export type ListChurchesQuery = z.infer<typeof listChurchesQuerySchema>;
export type CreateChurchInput = z.infer<typeof createChurchSchema>;
export type TeamActionInput = z.infer<typeof teamActionSchema>;
export type ChangeAccountOwnerInput = z.infer<typeof changeAccountOwnerSchema>;

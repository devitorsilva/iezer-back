import { OrganizationStatus } from "@prisma/client";
import { z } from "zod";
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

export type ListChurchesQuery = z.infer<typeof listChurchesQuerySchema>;
export type CreateChurchInput = z.infer<typeof createChurchSchema>;
export type TeamActionInput = z.infer<typeof teamActionSchema>;

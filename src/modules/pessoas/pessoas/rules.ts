import type { PersonBond } from "@prisma/client";
import { ageOn } from "../../../lib/civil-date.js";

// Mínimo obrigatório por vínculo (PRD Pessoas › Vínculo e dados mínimos por estágio)
// e regra do menor de 18 anos (RF-C04, RF-F02, RF-P09).
export type MissingField =
  | "fullName"
  | "contact"
  | "conversionDate"
  | "admissionMethodId"
  | "admissionDate"
  | "birthDate"
  | "guardian"
  | "consent";

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  fullName: "nome completo",
  contact: "um contato (celular, telefone ou email)",
  conversionDate: "data de conversão",
  admissionMethodId: "forma de admissão",
  admissionDate: "data de admissão",
  birthDate: "data de nascimento",
  guardian: "responsável vinculado",
  consent: "consentimento dado pelo responsável",
};

export interface RequirementInput {
  name: string;
  bond: PersonBond;
  birthDate?: Date | null;
  mobilePhone?: string | null;
  secondaryPhone?: string | null;
  email?: string | null;
  conversionDate?: Date | null;
  admissionMethodId?: string | null;
  admissionDate?: Date | null;
  hasGuardian: boolean;
  hasConsent: boolean;
}

export function isFullName(name: string) {
  return name.trim().split(/\s+/).length >= 2;
}

export function isMinor(birthDate: Date | null | undefined) {
  return birthDate ? ageOn(birthDate) < 18 : false;
}

export function missingFields(person: RequirementInput): MissingField[] {
  const missing = new Set<MissingField>();
  const minor = isMinor(person.birthDate);
  const requireFullName = () => !isFullName(person.name) && missing.add("fullName");

  switch (person.bond) {
    case "VISITANTE":
      // Criança visitante entra pelo contato do responsável.
      if (!minor && !person.mobilePhone && !person.secondaryPhone && !person.email) missing.add("contact");
      break;
    case "NOVO_CONVERTIDO":
      requireFullName();
      if (!person.conversionDate) missing.add("conversionDate");
      break;
    case "CONGREGADO":
      requireFullName();
      break;
    case "MEMBRO":
      requireFullName();
      if (!person.admissionMethodId) missing.add("admissionMethodId");
      if (!person.admissionDate) missing.add("admissionDate");
      break;
    case "MEMBRO_EM_FORMACAO":
      requireFullName();
      if (!person.birthDate) missing.add("birthDate");
      if (!person.hasGuardian) missing.add("guardian");
      break;
  }

  if (minor) {
    if (!person.hasGuardian) missing.add("guardian");
    if (!person.hasConsent) missing.add("consent");
  }

  return [...missing];
}

export function describeMissing(fields: MissingField[]) {
  return fields.map((field) => MISSING_FIELD_LABELS[field]).join(", ");
}

// Sobrenome para o nome da família criada a partir do responsável.
export function familyNameFor(name: string) {
  const words = name.trim().split(/\s+/);
  return `Família ${words[words.length - 1]}`;
}

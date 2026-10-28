import type { FamilyRole, PersonBond } from "@prisma/client";
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

// Responsável na família (RF-F02): Responsável ou Cônjuge maior de idade.
export const GUARDIAN_ROLES: FamilyRole[] = ["RESPONSAVEL", "CONJUGE"];

export interface FamilyMemberRule {
  personId: string;
  role: FamilyRole;
  birthDate: Date | null;
  bond: PersonBond;
}

export function isGuardianMember(member: Pick<FamilyMemberRule, "role" | "birthDate">) {
  return GUARDIAN_ROLES.includes(member.role) && !isMinor(member.birthDate);
}

// Contato principal (RF-F08): o primeiro adulto pela ordem de entrada (quem chama passa os membros
// nessa ordem). Sem data de nascimento conta como adulto, como em `isMinor`.
export function firstAdult<T extends { personId: string; birthDate: Date | null }>(members: T[]) {
  return members.find((member) => !isMinor(member.birthDate))?.personId ?? null;
}

// Endereço e telefone fixo do domicílio (RF-F03): os do contato principal, copiados para quem a
// secretaria marcar. `FAMILY_ADDRESS_FIELDS` decide quem "tem o mesmo endereço" (sem o telefone).
export const FAMILY_ADDRESS_FIELDS = ["postalCode", "street", "number", "complement", "district", "city", "state"] as const;
export const FAMILY_SHARED_FIELDS = [...FAMILY_ADDRESS_FIELDS, "secondaryPhone"] as const;

export type FamilySharedField = (typeof FAMILY_SHARED_FIELDS)[number];
export type FamilyAddress = Record<FamilySharedField, string | null>;

export function familyAddressOf(person: FamilyAddress): FamilyAddress | null {
  if (FAMILY_ADDRESS_FIELDS.every((field) => !person[field])) return null;
  return Object.fromEntries(FAMILY_SHARED_FIELDS.map((field) => [field, person[field]])) as FamilyAddress;
}

export function sameAddress(person: FamilyAddress, address: FamilyAddress) {
  return FAMILY_ADDRESS_FIELDS.every((field) => (person[field] ?? null) === (address[field] ?? null));
}

// Quem precisa de responsável (menor de 18 ou Membro em formação) e não tem um na família.
export function membersWithoutGuardian(members: FamilyMemberRule[]) {
  return members
    .filter((member) => isMinor(member.birthDate) || member.bond === "MEMBRO_EM_FORMACAO")
    .filter((member) => !members.some((other) => other.personId !== member.personId && isGuardianMember(other)))
    .map((member) => member.personId);
}

import { isPasswordCompromised } from "better-auth/plugins";
import { AppError } from "./errors.js";
import { normalizeSearchText } from "./text.js";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const compact = (value: string) => normalizeSearchText(value).replace(/\s+/g, "");

interface PasswordContext {
  email: string;
  churchName?: string | null;
}

// Regras de senha do iEzer (PRD Acesso › Segurança e sessão, linha Senha): 12+ caracteres,
// sem regra de composição, recusa o e-mail e o nome da igreja, dizendo o motivo.
// Devolve a mensagem do problema ou null.
export function passwordRuleViolation(password: string, { email, churchName }: PasswordContext) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }

  const normalized = compact(password);
  const [localPart = ""] = email.toLowerCase().split("@");

  if (normalized.includes(compact(email)) || (localPart.length >= 4 && normalized.includes(compact(localPart)))) {
    return "A senha não pode conter o seu e-mail.";
  }

  const church = churchName ? compact(churchName) : "";
  if (church.length >= 4 && normalized.includes(church)) {
    return "A senha não pode conter o nome da igreja.";
  }

  return null;
}

// Regras + senhas vazadas (Have I Been Pwned), para fluxos fora do Better Auth (aceite do convite).
export async function assertValidNewPassword(password: string, context: PasswordContext) {
  const violation = passwordRuleViolation(password, context);
  if (violation) throw new AppError(400, "WEAK_PASSWORD", violation, { field: "password" });

  if (await isPasswordCompromised(password)) {
    throw new AppError(
      400,
      "PASSWORD_COMPROMISED",
      "Essa senha aparece em vazamentos conhecidos. Escolha outra.",
      { field: "password" },
    );
  }
}

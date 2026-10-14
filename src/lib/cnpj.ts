// CNPJ só com dígitos, validado pelo dígito verificador.
export function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

// Dígitos verificadores sobre 12 caracteres [0-9A-Z]: cada um vale o código ASCII menos 48, o que
// mantém o cálculo do CNPJ numérico e cobre o alfanumérico (Receita, a partir de 2026).
function hasValidCheckDigits(chars: string) {
  const checkDigit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const total = weights.reduce((sum, weight, i) => sum + (chars.charCodeAt(i) - 48) * weight, 0);
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return checkDigit(12) === Number(chars[12]) && checkDigit(13) === Number(chars[13]);
}

export function isValidCnpj(value: string) {
  const digits = normalizeCnpj(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  return hasValidCheckDigits(digits);
}

// Numérico ou alfanumérico (12 caracteres [0-9A-Z] e 2 dígitos), com ou sem máscara.
export function isValidAnyCnpj(value: string) {
  const chars = value.replace(/[.\-/\s]/g, "").toUpperCase();
  if (!/^[0-9A-Z]{12}\d{2}$/.test(chars) || /^(\d)\1{13}$/.test(chars)) return false;
  return hasValidCheckDigits(chars);
}

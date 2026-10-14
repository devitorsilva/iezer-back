// Telefone guardado só com dígitos e DDI, para a Mensageria (RT-B06). O front exibe mascarado.
// Número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55; com "+" na frente, o DDI é respeitado.
export function normalizePhone(value: string): string | null {
  const international = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");

  if (!international && (digits.length === 10 || digits.length === 11)) {
    return isValidBrazilianNumber(digits) ? `55${digits}` : null;
  }

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return isValidBrazilianNumber(digits.slice(2)) ? digits : null;
  }

  if (international && digits.length >= 8 && digits.length <= 15) return digits;

  return null;
}

// DDD 11–99; celular com 9 dígitos começando por 9, fixo com 8 dígitos começando por 2–5.
function isValidBrazilianNumber(digits: string) {
  const ddd = Number(digits.slice(0, 2));
  const number = digits.slice(2);
  if (ddd < 11) return false;
  return number.length === 9 ? number.startsWith("9") : /^[2-5]/.test(number);
}

// Dígitos digitados numa busca, para comparar com o número guardado (com ou sem DDI).
export function phoneSearchDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

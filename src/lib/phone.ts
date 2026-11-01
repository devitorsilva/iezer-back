import type { z } from "zod";

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

function isValidBrazilianNumber(digits: string) {
  return brazilianNumberProblem(digits) === null;
}

// DDD 11–99; celular com 9 dígitos começando por 9, fixo com 8 dígitos começando por 2–5.
function brazilianNumberProblem(digits: string) {
  const ddd = Number(digits.slice(0, 2));
  const number = digits.slice(2);
  if (ddd < 11) return "DDD inválido.";
  if (number.length === 9) return number.startsWith("9") ? null : CELULAR;
  // 8 dígitos começando por 6–9 é um celular sem o 9 da frente.
  if (/^[2-5]/.test(number)) return null;
  return /^[6-9]/.test(number) ? CELULAR : "Telefone fixo deve ter 8 dígitos e começar com 2 a 5.";
}

const CELULAR = "Celular deve ter 9 dígitos e começar com 9.";

// Motivo de um telefone recusado por normalizePhone, para a mensagem do campo (null = válido).
export function phoneProblem(value: string): string | null {
  const international = value.trim().startsWith("+");
  const digits = value.replace(/\D/g, "");

  if (!international && (digits.length === 10 || digits.length === 11)) return brazilianNumberProblem(digits);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return brazilianNumberProblem(digits.slice(2));
  if (international) return digits.length >= 8 && digits.length <= 15 ? null : "Telefone internacional deve ter de 8 a 15 dígitos.";
  return "Telefone inválido. Informe DDD e número.";
}

// Para os schemas: a mensagem do campo diz o motivo real.
export function refinePhone(value: string, ctx: z.RefinementCtx) {
  const problem = phoneProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
}

// Dígitos digitados numa busca, para comparar com o número guardado (com ou sem DDI).
export function phoneSearchDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
}

// CPF só com dígitos, validado pelo dígito verificador (RT-B07).
export function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string) {
  const digits = normalizeCpf(value);
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number) => {
    let total = 0;
    for (let i = 0; i < length; i++) total += Number(digits[i]) * (length + 1 - i);
    return ((total * 10) % 11) % 10;
  };

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
}

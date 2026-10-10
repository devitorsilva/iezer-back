// Datas civis (nascimento, conversão, admissão…) são @db.Date (RT-B05): na API, sempre "YYYY-MM-DD".
// O Prisma lê e grava DATE como meia-noite UTC; por isso a conversão é toda em UTC.
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CHURCH_TIME_ZONE = "America/Sao_Paulo";

export function isCivilDate(value: string) {
  const match = CIVIL_DATE.exec(value);
  if (!match) return false;
  const date = parseCivilDate(value);
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]);
}

export function parseCivilDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatCivilDate(date: Date): string;
export function formatCivilDate(date: Date | null): string | null;
export function formatCivilDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

// Hoje no fuso da igreja, como data civil.
export function todayCivil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TIME_ZONE }).format(new Date());
}

// Idade calculada, nunca guardada (PRD Pessoas › Campos por seção).
export function ageOn(birthDate: Date, today = todayCivil()) {
  const [year, month, day] = today.split("-").map(Number);
  const age = year - birthDate.getUTCFullYear();
  const hadBirthday =
    month > birthDate.getUTCMonth() + 1 || (month === birthDate.getUTCMonth() + 1 && day >= birthDate.getUTCDate());
  return hadBirthday ? age : age - 1;
}

// Data civil de `years` anos atrás (29/02 vira 28/02 em ano não bissexto).
export function yearsAgo(years: number, today = todayCivil()) {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year - years, month - 1, day));
  if (date.getUTCMonth() !== month - 1) date.setUTCDate(0);
  return date;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

import { prisma } from "./prisma.js";

// Bloqueio do login por e-mail (PRD Acesso, A6 e Segurança e sessão › Tentativas): a cada 5 erros
// seguidos, bloqueio de 15 min que dobra a cada nova série, até 24 h. Vale também para e-mail sem
// usuário, para não revelar quem existe (RF-LG03). Login certo ou senha redefinida zeram a conta.

const FAILURES_PER_LOCK = 5;
const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;
// Erros espaçados por mais de um dia não são "seguidos".
const RESET_AFTER_MS = 24 * 60 * 60 * 1000;

export const LOGIN_LOCKED_CODE = "LOGIN_LOCKED";

const normalize = (email: string) => email.trim().toLowerCase();

export function loginLockedMessage(lockedUntil: Date) {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  const wait = minutes >= 60 ? `${Math.ceil(minutes / 60)} h` : `${minutes} min`;
  return `Muitas tentativas erradas. Por segurança, o login deste e-mail está bloqueado por ${wait}. Se esqueceu a senha, use "Esqueci minha senha".`;
}

// Data até quando o login do e-mail está bloqueado, ou null.
export async function findLoginLock(email: string) {
  const lock = await prisma.loginLock.findUnique({ where: { email: normalize(email) } });
  return lock?.lockedUntil && lock.lockedUntil > new Date() ? lock.lockedUntil : null;
}

// Conta um erro; devolve a data do bloqueio quando este erro fecha uma série de 5.
export async function recordLoginFailure(email: string) {
  const key = normalize(email);
  const now = Date.now();
  const current = await prisma.loginLock.findUnique({ where: { email: key } });
  const stale = current && now - current.updatedAt.getTime() > RESET_AFTER_MS;
  const failures = (stale ? 0 : (current?.failures ?? 0)) + 1;

  const locks = failures % FAILURES_PER_LOCK === 0;
  const lockedUntil = locks
    ? new Date(now + Math.min(BASE_LOCK_MS * 2 ** (failures / FAILURES_PER_LOCK - 1), MAX_LOCK_MS))
    : null;

  await prisma.loginLock.upsert({
    where: { email: key },
    create: { email: key, failures, lockedUntil },
    update: { failures, ...(locks || stale ? { lockedUntil } : {}) },
  });

  return lockedUntil;
}

export async function clearLoginFailures(email: string) {
  await prisma.loginLock.deleteMany({ where: { email: normalize(email) } });
}

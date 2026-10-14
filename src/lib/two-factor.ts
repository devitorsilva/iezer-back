import type { Prisma } from "@prisma/client";
import { permissionCatalog, type PermissionKey } from "../modules/acesso/permissoes/catalog/index.js";
import { prisma } from "./prisma.js";
import { isTeamUser } from "./team.js";

export const PROTECTED_PERMISSION_KEYS: PermissionKey[] = permissionCatalog
  .filter((permission) => permission.protected)
  .map((permission) => permission.key);

export const TWO_FACTOR_REQUIRED_CODE = "TWO_FACTOR_REQUIRED";
export const TWO_FACTOR_REQUIRED_MESSAGE = "Digite o código de verificação para continuar.";
export const TWO_FACTOR_SETUP_REQUIRED_CODE = "TWO_FACTOR_SETUP_REQUIRED";
export const TWO_FACTOR_SETUP_REQUIRED_MESSAGE =
  "Você tem permissões protegidas: configure a verificação em duas etapas para continuar.";

// 2FA obrigatório para quem tem permissão protegida numa organização ativa (RF-CV07). Desde a
// Sprint 12, o login pelo Google não dispensa o 2FA do iEzer (A3 revisto). O atendente do
// suporte sempre usa 2FA (RF-SP06), e toda a equipe iEzer só pelo app autenticador (B2).
export async function requiresTwoFactor(userId: string, db: Prisma.TransactionClient = prisma) {
  if (await isTeamUser(userId, db)) return true;

  const assignment = await db.userAssignment.findFirst({
    where: {
      userId,
      organization: { isActive: true },
      profile: { permissions: { some: { permissionKey: { in: PROTECTED_PERMISSION_KEYS } } } },
    },
    select: { id: true },
  });

  return assignment !== null;
}

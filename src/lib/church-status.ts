import type { OrganizationStatus } from "@prisma/client";
import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";

// Igreja suspensa ou encerrada (B5, RF-BO20, RT-BB04): ninguém da igreja entra, e os dados ficam
// guardados. Vale para a sede e todas as congregações.
export const CHURCH_SUSPENDED_CODE = "CHURCH_SUSPENDED";

const BLOCKED_STATUSES: OrganizationStatus[] = ["SUSPENSA", "ENCERRADA"];

export const isChurchBlocked = (status: OrganizationStatus) => BLOCKED_STATUSES.includes(status);

export function churchBlockedMessage(status: OrganizationStatus) {
  return status === "ENCERRADA"
    ? "A conta da sua igreja no iEzer foi encerrada. Fale com o responsável pela conta."
    : "O acesso da sua igreja está suspenso. Fale com o responsável pela conta.";
}

export const churchBlockedError = (status: OrganizationStatus) =>
  new AppError(403, CHURCH_SUSPENDED_CODE, churchBlockedMessage(status), { churchStatus: status });

// Situação bloqueada da igreja do usuário, pelas atribuições ou pela pessoa (primeiro login pelo
// Google, antes das atribuições). Conta da equipe não tem nenhuma das duas: sempre null.
export async function findBlockedChurchStatus(userId: string): Promise<OrganizationStatus | null> {
  const linked = {
    OR: [{ assignments: { some: { userId } } }, { people: { some: { user: { id: userId } } } }],
  };
  const church = await prisma.organization.findFirst({
    where: { parentId: null, status: { in: BLOCKED_STATUSES }, OR: [linked, { children: { some: linked } }] },
    select: { status: true },
  });
  return church?.status ?? null;
}

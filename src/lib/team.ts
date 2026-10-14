import type { Prisma, TeamRole } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuditActor } from "./audit.js";
import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";
import { TEAM_TERMS_VERSION } from "./terms.js";

// Equipe iEzer (PRD Back-office, B1 a B3, RT-BB01 a RT-BB03): contas só do back-office, com
// papéis fixos no código. O Administrador iEzer faz tudo o que os outros papéis fazem.

export const TEAM_ROLES = ["ADMINISTRADOR", "SUPORTE", "IMPLANTACAO"] as const satisfies readonly TeamRole[];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  ADMINISTRADOR: "Administrador iEzer",
  SUPORTE: "Suporte",
  IMPLANTACAO: "Implantação",
};

// Sessão da equipe cai após 12h sem uso (B2). O último uso é gravado no máximo a cada 5 min.
export const TEAM_SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
const TEAM_SESSION_TOUCH_MS = 5 * 60 * 1000;

export const TEAM_ACCOUNT_REQUIRED_CODE = "TEAM_ACCOUNT_REQUIRED";
export const TEAM_ACCOUNT_REQUIRED_MESSAGE = "Esta conta não tem acesso ao back-office do iEzer.";
export const TEAM_TOTP_ONLY_CODE = "TEAM_TOTP_ONLY";
export const TEAM_TOTP_ONLY_MESSAGE =
  "Contas da equipe iEzer usam só o app autenticador. O código por e-mail não vale.";
export const TEAM_TWO_FACTOR_SETUP_MESSAGE = "Configure o app autenticador para continuar.";

// Contas exclusivas (Segurança da equipe): e-mail da equipe não vira conta de igreja.
export const teamEmailError = () =>
  new AppError(409, "TEAM_EMAIL", "Este e-mail é de uma conta da equipe iEzer. Use outro e-mail.", { field: "email" });

// E-mail de membro da equipe ou de convite da equipe ainda válido.
export async function isTeamEmail(email: string, db: Prisma.TransactionClient = prisma) {
  const [member, invite] = await Promise.all([
    db.teamMember.count({ where: { user: { email } } }),
    db.teamInvite.count({ where: { email, status: "PENDENTE", expiresAt: { gt: new Date() } } }),
  ]);
  return member + invite > 0;
}

export interface TeamContext {
  memberId: string;
  roles: TeamRole[];
  termsVersion: string | null;
  // App autenticador configurado (o código por e-mail não conta para a equipe).
  totpEnabled: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    // Membro da equipe dono da sessão; null para conta de igreja.
    team: TeamContext | null;
  }
}

export async function findTeamMember(userId: string, db: Prisma.TransactionClient = prisma): Promise<TeamContext | null> {
  const member = await db.teamMember.findUnique({
    where: { userId },
    select: {
      id: true,
      roles: true,
      termsVersion: true,
      user: { select: { twoFactors: { where: { verified: true }, select: { id: true }, take: 1 } } },
    },
  });

  if (!member) return null;
  return {
    memberId: member.id,
    roles: member.roles,
    termsVersion: member.termsVersion,
    totpEnabled: member.user.twoFactors.length > 0,
  };
}

export async function isTeamUser(userId: string, db: Prisma.TransactionClient = prisma) {
  return (await db.teamMember.count({ where: { userId } })) > 0;
}

export function hasTeamRole(roles: readonly TeamRole[] | null | undefined, ...wanted: TeamRole[]) {
  if (!roles) return false;
  return roles.includes("ADMINISTRADOR") || wanted.some((role) => roles.includes(role));
}

// Confere a ociosidade da sessão da equipe e registra o uso. false = sessão vencida (apagada).
export async function touchTeamSession(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { lastActiveAt: true } });
  if (!session) return false;

  const idle = Date.now() - session.lastActiveAt.getTime();
  if (idle > TEAM_SESSION_IDLE_MS) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
    return false;
  }

  if (idle > TEAM_SESSION_TOUCH_MS) {
    await prisma.session.updateMany({ where: { id: sessionId }, data: { lastActiveAt: new Date() } });
  }
  return true;
}

// Administradores iEzer ativos: destinatários dos alertas da equipe (RF-BO55, RT-BB13).
export function teamAdminRecipients(db: Prisma.TransactionClient = prisma) {
  return db.user.findMany({
    where: { status: "ATIVO", teamMember: { roles: { has: "ADMINISTRADOR" } } },
    select: { id: true, name: true, email: true },
  });
}

// Autor das ações da equipe no AuditLog (RT-BB12).
export const teamActor = (request: FastifyRequest): AuditActor => ({
  type: "SUPORTE",
  userId: request.user.id,
  ip: request.ip ?? null,
  userAgent: request.headers["user-agent"] ?? null,
});

const isTeamMeRoute = (request: FastifyRequest) => request.routeOptions.url?.startsWith("/api/admin/me") ?? false;

// Hook do escopo /api/admin: só conta da equipe (RF-BO02, RT-BB01) e com o termo aceito.
// /api/admin/me responde antes do termo, para o front pedir o aceite.
export async function requireTeamSession(request: FastifyRequest, reply: FastifyReply) {
  if (!request.team) {
    return reply.code(403).send({
      statusCode: 403,
      code: TEAM_ACCOUNT_REQUIRED_CODE,
      message: TEAM_ACCOUNT_REQUIRED_MESSAGE,
    });
  }

  if (!isTeamMeRoute(request) && request.team.termsVersion !== TEAM_TERMS_VERSION) {
    return reply.code(403).send({
      statusCode: 403,
      code: "TEAM_TERMS_REQUIRED",
      message: "Aceite o termo de confidencialidade da equipe para continuar.",
    });
  }
}

// Papel por rota (RT-BB01), nunca pelo que o front diz. Qualquer um dos papéis basta.
export function requireTeamRole(...roles: TeamRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (hasTeamRole(request.team?.roles, ...roles)) return;

    return reply.code(403).send({
      statusCode: 403,
      code: "TEAM_ROLE_FORBIDDEN",
      message: "Seu papel na equipe iEzer não permite esta ação.",
    });
  };
}

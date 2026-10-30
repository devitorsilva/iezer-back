import type { TeamRole } from "@prisma/client";
import { env } from "../config/env.js";
import { INVITE_TTL_MS, TEAM_SIGNATURE as SIGNATURE } from "./emails.js";
import type { MailMessage } from "./mailer.js";
import { TEAM_ROLE_LABELS } from "./team.js";

// E-mails da equipe iEzer (RT-BB13). Links apontam para o app admin (ADMIN_WEB_ORIGIN). Sem
// RESEND_API_KEY, vão para o log como os outros.

export const TEAM_INVITE_TTL_MS = INVITE_TTL_MS;

export const teamInviteUrl = (token: string) => `${env.ADMIN_WEB_ORIGIN}/convite/${token}`;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDateTime = (date: Date) => `${dateTime.format(date)} (horário de Brasília)`;

export const teamRolesText = (roles: readonly TeamRole[]) => roles.map((role) => TEAM_ROLE_LABELS[role]).join(", ");

// Convite para a equipe (RF-BO03, RF-BO07).
export function teamInviteEmail(input: {
  to: string;
  name: string;
  roles: readonly TeamRole[];
  inviterName: string | null;
  token: string;
}): MailMessage {
  const who = input.inviterName ? `${input.inviterName} convidou você` : "Você foi convidado(a)";

  return {
    to: input.to,
    subject: "Convite para a equipe iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `${who} para o back-office do iEzer, com o papel: ${teamRolesText(input.roles)}.\n\n` +
      `No primeiro acesso você define a senha, configura o app autenticador (Google Authenticator, ` +
      `Microsoft Authenticator ou outro), guarda os códigos de recuperação e aceita o termo de confidencialidade.\n\n` +
      `O link vale por 72 horas e só pode ser usado uma vez:\n${teamInviteUrl(input.token)}` +
      SIGNATURE,
  };
}

// Login de um membro da equipe em dispositivo ou local novo, a cada Administrador iEzer (RF-BO55).
export function teamLoginNotice(input: {
  to: string;
  adminName: string;
  memberName: string;
  memberEmail: string;
  at: Date;
  device: string;
  ip: string | null;
  location: string | null;
}): MailMessage {
  return {
    to: input.to,
    subject: `Login em dispositivo novo na equipe iEzer: ${input.memberName}`,
    text:
      `Olá, ${firstName(input.adminName)}!\n\n` +
      `${input.memberName} (${input.memberEmail}) entrou no iEzer com um navegador e sistema que não aparecem nos logins dos últimos 90 dias.\n\n` +
      `Quando: ${formatDateTime(input.at)}\n` +
      `Navegador: ${input.device}\n` +
      `Local aproximado: ${input.location ?? "não informado"}\n` +
      `IP: ${input.ip ?? "não informado"}\n\n` +
      `Se este acesso não era esperado, desative o membro em Equipe e fale com ele.` +
      SIGNATURE,
  };
}

// Login de um membro bloqueado por erros seguidos (Segurança da equipe › Tentativas).
export function teamLoginLockedNotice(input: {
  to: string;
  adminName: string;
  memberName: string;
  memberEmail: string;
  lockedUntil: Date;
}): MailMessage {
  return {
    to: input.to,
    subject: `Login bloqueado na equipe iEzer: ${input.memberName}`,
    text:
      `Olá, ${firstName(input.adminName)}!\n\n` +
      `Houve 5 tentativas erradas seguidas de entrar com a conta de ${input.memberName} (${input.memberEmail}). ` +
      `O login está bloqueado até ${formatDateTime(input.lockedUntil)}.\n\n` +
      `Confirme com o membro se foi ele. Se não foi, desative a conta em Equipe.` +
      SIGNATURE,
  };
}

const churchUrl = (churchId: string) => `${env.ADMIN_WEB_ORIGIN}/igrejas/${churchId}`;
const requestsUrl = () => `${env.ADMIN_WEB_ORIGIN}/pedidos`;

// Pedido de acesso com escrita ou emergência esperando um Administrador iEzer (RF-BO35, RF-BO39,
// RF-BO54). Vai a todos os Administradores, menos quem pediu.
export function teamApprovalNeededNotice(input: {
  to: string;
  name: string;
  churchName: string;
  requesterName: string;
  // Rótulo da emergência ("incidente", "ordem judicial"...); nulo no pedido com escrita.
  emergencyLabel: string | null;
  reason: string;
  ticket: string | null;
}): MailMessage {
  const what = input.emergencyLabel
    ? `abriu um acesso de emergência (${input.emergencyLabel})`
    : "pediu acesso com alteração de dados";

  return {
    to: input.to,
    subject: input.emergencyLabel
      ? `Emergência aguardando aprovação: ${input.churchName}`
      : `Pedido com escrita aguardando aprovação: ${input.churchName}`,
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `${input.requesterName} ${what} à ${input.churchName}.\n\n` +
      `Motivo: ${input.reason}\n` +
      (input.ticket ? `Chamado: ${input.ticket}\n` : "") +
      `\nO pedido só segue com a aprovação de um Administrador iEzer diferente de quem pediu:\n${requestsUrl()}` +
      SIGNATURE,
  };
}

export type TeamRequestDecision = "APROVADO_IEZER" | "EMERGENCIA_APROVADA" | "RECUSADO_IEZER" | "APROVADO_IGREJA" | "RECUSADO_IGREJA";

const DECISION_TEXT: Record<TeamRequestDecision, { subject: string; body: string }> = {
  APROVADO_IEZER: {
    subject: "Pedido de acesso aprovado pelo iEzer",
    body: "foi aprovado pelo iEzer e seguiu para a igreja, que tem 7 dias para responder",
  },
  EMERGENCIA_APROVADA: { subject: "Emergência aprovada", body: "foi aprovado e o acesso de emergência já está ativo" },
  RECUSADO_IEZER: { subject: "Pedido de acesso recusado pelo iEzer", body: "foi recusado pelo iEzer" },
  APROVADO_IGREJA: { subject: "Pedido de acesso aprovado pela igreja", body: "foi aprovado pela igreja e o acesso já está ativo" },
  RECUSADO_IGREJA: { subject: "Pedido de acesso recusado pela igreja", body: "foi recusado pela igreja" },
};

// Pedido aprovado ou recusado, a quem pediu (RF-BO54).
export function teamRequestDecisionNotice(input: {
  to: string;
  name: string;
  churchName: string;
  decision: TeamRequestDecision;
  deciderName: string;
  reason: string | null;
  expiresAt: Date | null;
}): MailMessage {
  const text = DECISION_TEXT[input.decision];

  return {
    to: input.to,
    subject: `${text.subject}: ${input.churchName}`,
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Seu pedido de acesso à ${input.churchName} ${text.body} (${input.deciderName}).\n` +
      (input.reason ? `Motivo: ${input.reason}\n` : "") +
      (input.expiresAt ? `O acesso vale até ${formatDateTime(input.expiresAt)}.\n` : "") +
      `\nPedidos de acesso: ${requestsUrl()}` +
      SIGNATURE,
  };
}

// Igreja que ficou sem admin ativo, a Suporte e Administradores (B12, RF-BO54).
export function churchWithoutAdminNotice(input: {
  to: string;
  name: string;
  churchId: string;
  churchName: string;
  cause: string;
}): MailMessage {
  return {
    to: input.to,
    subject: `Igreja sem administrador: ${input.churchName}`,
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `A ${input.churchName} ficou sem nenhum administrador ativo. ${input.cause}\n\n` +
      `O responsável pela conta foi avisado. Combine com ele a recuperação de admin:\n${churchUrl(input.churchId)}` +
      SIGNATURE,
  };
}

// App autenticador redefinido por um Administrador iEzer (RF-BO09).
export function teamAuthenticatorResetNotice(input: { to: string; name: string; byName: string }): MailMessage {
  return {
    to: input.to,
    subject: "Seu app autenticador do iEzer foi redefinido",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `${input.byName} redefiniu o app autenticador da sua conta da equipe iEzer, e as suas sessões foram encerradas.\n\n` +
      `No próximo login, entre com a sua senha e configure o app autenticador de novo. ` +
      `Se você não pediu isso, fale com um Administrador iEzer.` +
      SIGNATURE,
  };
}

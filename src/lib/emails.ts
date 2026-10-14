import { env } from "../config/env.js";
import type { MailMessage } from "./mailer.js";

// Textos dos e-mails transacionais do Acesso. Links apontam para o front (WEB_ORIGIN).

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

export const inviteUrl = (token: string) => `${env.WEB_ORIGIN}/convite/${token}`;
export const passwordResetUrl = (token: string) => `${env.WEB_ORIGIN}/redefinir-senha/${token}`;
export const emailChangeUrl = (token: string) => `${env.WEB_ORIGIN}/confirmar-email/${token}`;
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
export const TWO_FACTOR_CODE_TTL_MINUTES = 10;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const SIGNATURE = "\n\n—\nEquipe iEzer\nSe você não esperava este e-mail, pode ignorá-lo.";

export function inviteEmail(input: {
  to: string;
  personName: string;
  churchName: string;
  inviterName: string | null;
  token: string;
}): MailMessage {
  const who = input.inviterName ? `${input.inviterName} convidou você` : "Você foi convidado(a)";

  return {
    to: input.to,
    churchName: input.churchName,
    subject: `Convite para acessar o iEzer da ${input.churchName}`,
    text:
      `Olá, ${firstName(input.personName)}!\n\n` +
      `${who} para acessar o iEzer da ${input.churchName}.\n\n` +
      `Para criar seu acesso, abra o link abaixo. Ele vale por 72 horas e só pode ser usado uma vez:\n` +
      `${inviteUrl(input.token)}` +
      SIGNATURE,
  };
}

export function passwordResetEmail(input: { to: string; name: string; churchName: string | null; token: string }): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Defina uma nova senha no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Use o link abaixo para definir uma nova senha. Ele vale por 1 hora e só pode ser usado uma vez:\n` +
      `${passwordResetUrl(input.token)}\n\n` +
      `Se você não pediu, ignore este e-mail: sua senha atual continua valendo.` +
      SIGNATURE,
  };
}

// Alerta de senha (Segurança e sessão › Alertas): redefinida pelo link, trocada ou definida em Minha conta.
export function passwordChangedEmail(input: {
  to: string;
  name: string;
  churchName: string | null;
  kind?: "redefinida" | "alterada" | "definida";
}): MailMessage {
  const kind = input.kind ?? "redefinida";

  return {
    to: input.to,
    churchName: input.churchName,
    subject: kind === "definida" ? "Você definiu uma senha no iEzer" : "Sua senha do iEzer foi alterada",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      (kind === "definida"
        ? `Uma senha acabou de ser definida para a sua conta no iEzer. Agora você também pode entrar com e-mail e senha.\n\n`
        : `A senha da sua conta no iEzer acabou de ser ${kind}, e as sessões abertas em outros aparelhos foram encerradas.\n\n`) +
      `Se não foi você, fale agora com o administrador da sua igreja.` +
      SIGNATURE,
  };
}

export function emailChangedNotice(input: {
  to: string;
  name: string;
  newEmail: string;
  churchName: string | null;
  // Troca feita pelo próprio usuário em Minha conta (RF-MC06), não pelo admin (RF-RS04).
  self?: boolean;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "O e-mail do seu acesso ao iEzer foi trocado",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      (input.self
        ? `O e-mail do seu acesso ao iEzer foi trocado para ${input.newEmail}, confirmado pelo link enviado ao endereço novo. `
        : `O administrador da sua igreja trocou o e-mail do seu acesso ao iEzer para ${input.newEmail}. `) +
      `Este endereço não entra mais na conta.\n\n` +
      `Se você não pediu essa troca, fale com o administrador da sua igreja.` +
      SIGNATURE,
  };
}

// Toda concessão de permissão protegida avisa quem já a possui (Acesso › Travas de segurança).
export function protectedGrantedNotice(input: {
  to: string;
  name: string;
  churchName: string | null;
  grants: { userName: string; permissions: string[] }[];
}): MailMessage {
  const lines = input.grants.map(({ userName, permissions }) => `- ${userName}: ${permissions.join(", ")}`);

  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Permissões protegidas concedidas no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Você recebe este aviso porque tem permissões protegidas no iEzer da sua igreja. ` +
      `Estas pessoas acabam de recebê-las:\n\n${lines.join("\n")}\n\n` +
      `Se você não reconhece essa mudança, confira em Configurações › Usuários ou fale com os outros administradores.` +
      SIGNATURE,
  };
}

// Quem perde "Gerenciar perfis de acesso" é avisado, e os demais admins também.
export function adminRemovedNotice(input: {
  to: string;
  name: string;
  churchName: string | null;
  removedNames: string[];
  self: boolean;
}): MailMessage {
  const others = input.removedNames.join(", ");

  return {
    to: input.to,
    churchName: input.churchName,
    subject: input.self
      ? "Você deixou de administrar os acessos no iEzer"
      : "Mudança nos administradores do iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      (input.self
        ? `Você não tem mais a permissão "Gerenciar perfis de acesso" no iEzer da sua igreja.`
        : `Deixaram de ter a permissão "Gerenciar perfis de acesso": ${others}.`) +
      `\n\nSe você não reconhece essa mudança, fale agora com os outros administradores da sua igreja.` +
      SIGNATURE,
  };
}

// Suspensão automática (RF-US04, A15): a situação da pessoa saiu de Ativo. Vai para os admins e,
// quando nenhum sobra, para o responsável pela conta.
export function accessSuspendedNotice(input: {
  to: string;
  name: string;
  churchName: string | null;
  userName: string;
  reason: string;
  noAdminLeft: boolean;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: input.noAdminLeft
      ? "Sua igreja ficou sem administrador no iEzer"
      : `Acesso de ${input.userName} suspenso no iEzer`,
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `O acesso de ${input.userName} ao iEzer foi suspenso automaticamente: a situação no cadastro de Pessoas ` +
      `mudou para "${input.reason}". As sessões abertas foram encerradas.\n\n` +
      (input.noAdminLeft
        ? `Era a última pessoa com "Gerenciar perfis de acesso". Fale com o suporte do iEzer para recuperar a administração da conta.`
        : `Se foi engano, reative a pessoa em Pessoas e depois o acesso em Configurações › Usuários.`) +
      SIGNATURE,
  };
}

// Confirmação no e-mail novo antes da troca (RF-MC06).
export function emailChangeConfirmEmail(input: {
  to: string;
  name: string;
  churchName: string | null;
  token: string;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Confirme o seu novo e-mail no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Você pediu para entrar no iEzer com este e-mail. Para confirmar a troca, abra o link abaixo. ` +
      `Ele vale por 1 hora e só pode ser usado uma vez:\n` +
      `${emailChangeUrl(input.token)}\n\n` +
      `Depois da confirmação, as sessões abertas serão encerradas e você entra com o e-mail novo.` +
      SIGNATURE,
  };
}

// Código do 2FA por e-mail (RF-LG04): 6 dígitos, 10 minutos.
export function twoFactorCodeEmail(input: { to: string; name: string; churchName: string | null; code: string }): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    // Sem o código no assunto: sem Resend, em produção o assunto vai para o log.
    subject: "Seu código de verificação do iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Seu código de verificação é ${input.code}. Ele vale por ${TWO_FACTOR_CODE_TTL_MINUTES} minutos.\n\n` +
      `Não passe este código para ninguém. Se você não está tentando entrar no iEzer, troque a sua senha.` +
      SIGNATURE,
  };
}

// 2FA ativado, desativado ou redefinido pelo admin (Segurança e sessão › Alertas, RF-RS05).
export function twoFactorChangedNotice(input: {
  to: string;
  name: string;
  churchName: string | null;
  change: "ativada" | "desativada" | "redefinida";
}): MailMessage {
  const body = {
    ativada: "A verificação em duas etapas foi ativada na sua conta do iEzer.",
    desativada: "A verificação em duas etapas foi desativada na sua conta do iEzer.",
    redefinida:
      "O administrador da sua igreja redefiniu a verificação em duas etapas da sua conta do iEzer, e as sessões abertas foram encerradas. " +
      "No próximo login, configure de novo o app autenticador ou o código por e-mail.",
  }[input.change];

  return {
    to: input.to,
    churchName: input.churchName,
    subject: `Verificação em duas etapas ${input.change} no iEzer`,
    text:
      `Olá, ${firstName(input.name)}!\n\n${body}\n\n` +
      `Se não foi você, fale agora com o administrador da sua igreja.` +
      SIGNATURE,
  };
}

// Login em dispositivo novo (Segurança e sessão › Alertas).
export function newDeviceLoginNotice(input: {
  to: string;
  name: string;
  churchName: string | null;
  device: string;
  ip: string | null;
  location: string | null;
}): MailMessage {
  const where = [input.location, input.ip ? `IP ${input.ip}` : null].filter(Boolean).join(" · ");

  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Novo login no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Sua conta do iEzer acabou de ser acessada de um dispositivo novo: ${input.device}` +
      (where ? ` (${where})` : "") +
      `.\n\nSe foi você, não precisa fazer nada. Se não foi, troque a senha e encerre as outras sessões em Minha conta, ` +
      `ou fale com o administrador da sua igreja.` +
      SIGNATURE,
  };
}

// Login bloqueado após erros seguidos (PRD Acesso, A6).
export function loginLockedNotice(input: { to: string; name: string; churchName: string | null }): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Login bloqueado temporariamente no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Houve várias tentativas erradas de entrar no iEzer com o seu e-mail, e o login foi bloqueado por um tempo.\n\n` +
      `Se foi você, espere um pouco ou use "Esqueci minha senha". Se não foi, troque a sua senha assim que puder.` +
      SIGNATURE,
  };
}

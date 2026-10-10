import { env } from "../config/env.js";
import type { MailMessage } from "./mailer.js";

// Textos dos e-mails transacionais do Acesso. Links apontam para o front (WEB_ORIGIN).

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

export const inviteUrl = (token: string) => `${env.WEB_ORIGIN}/convite/${token}`;
export const passwordResetUrl = (token: string) => `${env.WEB_ORIGIN}/redefinir-senha/${token}`;

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

export function passwordChangedEmail(input: { to: string; name: string; churchName: string | null }): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Sua senha do iEzer foi alterada",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `A senha da sua conta no iEzer acabou de ser redefinida, e as sessões abertas em outros aparelhos foram encerradas.\n\n` +
      `Se não foi você, fale agora com o administrador da sua igreja.` +
      SIGNATURE,
  };
}

export function emailChangedNotice(input: {
  to: string;
  name: string;
  newEmail: string;
  churchName: string | null;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "O e-mail do seu acesso ao iEzer foi trocado",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `O administrador da sua igreja trocou o e-mail do seu acesso ao iEzer para ${input.newEmail}. ` +
      `Este endereço não entra mais na conta.\n\n` +
      `Se você não pediu essa troca, fale com o administrador da sua igreja.` +
      SIGNATURE,
  };
}

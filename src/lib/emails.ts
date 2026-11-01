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
export const TEAM_SIGNATURE = "\n\n—\nBack-office do iEzer\nMensagem interna da equipe iEzer.";

// Alertas de conta (senha, 2FA, dispositivo novo, bloqueio) também vão a contas da equipe iEzer,
// que não têm igreja: falam com um Administrador iEzer e assinam como o back-office.
const contactWho = (team?: boolean) => (team ? "um Administrador iEzer" : "o administrador da sua igreja");
const signature = (team?: boolean) => (team ? TEAM_SIGNATURE : SIGNATURE);

export function inviteEmail(input: {
  to: string;
  personName: string;
  churchName: string;
  inviterName: string | null;
  token: string;
}): MailMessage {
  const who = input.inviterName
    ? `${input.inviterName === "Equipe iEzer" ? "A equipe iEzer" : input.inviterName} convidou você`
    : "Você foi convidado(a)";

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
  team?: boolean;
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
      `Se não foi você, fale agora com ${contactWho(input.team)}.` +
      signature(input.team),
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
  team?: boolean;
  change: "ativada" | "desativada" | "redefinida" | "reconfigurada";
  // Quem redefiniu, quando não foi o admin da igreja (o suporte do iEzer, RF-BO30).
  by?: string;
}): MailMessage {
  const body = {
    ativada: "A verificação em duas etapas foi ativada na sua conta do iEzer.",
    desativada: "A verificação em duas etapas foi desativada na sua conta do iEzer.",
    redefinida:
      `${input.by ?? (input.team ? "Um Administrador iEzer" : "O administrador da sua igreja")} redefiniu a verificação em duas etapas da sua conta do iEzer, e as sessões abertas foram encerradas. ` +
      "No próximo login, configure de novo o app autenticador ou o código por e-mail.",
    reconfigurada:
      "O app autenticador da sua conta do iEzer foi trocado. O anterior deixou de valer, e as outras sessões foram encerradas.",
  }[input.change];

  return {
    to: input.to,
    churchName: input.churchName,
    subject: `Verificação em duas etapas ${input.change} no iEzer`,
    text:
      `Olá, ${firstName(input.name)}!\n\n${body}\n\n` +
      `Se não foi você, fale agora com ${contactWho(input.team)}.` +
      signature(input.team),
  };
}

// Login em dispositivo novo (Segurança e sessão › Alertas).
export function newDeviceLoginNotice(input: {
  to: string;
  name: string;
  churchName: string | null;
  team?: boolean;
  device: string;
  ip: string | null;
  location: string | null;
}): MailMessage {
  const where = [input.location, input.ip ? `IP ${input.ip}` : null].filter(Boolean).join(", ");

  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Novo login no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Sua conta do iEzer acabou de ser acessada de um dispositivo novo: ${input.device}` +
      (where ? ` (${where})` : "") +
      `.\n\nSe foi você, não precisa fazer nada. Se não foi, troque a senha e encerre as outras sessões em Minha conta, ` +
      `ou fale com ${contactWho(input.team)}.` +
      signature(input.team),
  };
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDateTime = (date: Date) => `${dateTime.format(date)} (horário de Brasília)`;

// Login bloqueado após erros seguidos (PRD Acesso, A6), com o horário real: o bloqueio cresce a
// cada série. A equipe não tem "Esqueci minha senha" no back-office.
export function loginLockedNotice(input: {
  to: string;
  name: string;
  churchName: string | null;
  lockedUntil: Date;
  team?: boolean;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Login bloqueado temporariamente no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Houve várias tentativas erradas de entrar no iEzer com o seu e-mail, e o login está bloqueado até ${formatDateTime(input.lockedUntil)}.\n\n` +
      (input.team
        ? `Se foi você, espere até esse horário ou fale com um Administrador iEzer. Se não foi, avise um Administrador iEzer.`
        : `Se foi você, espere até esse horário ou use "Esqueci minha senha". Se não foi, troque a sua senha assim que puder.`) +
      signature(input.team),
  };
}

// Acesso do suporte (PRD Acesso › Acesso do suporte do iEzer).

const supportDateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// "dd/mm, hh:mm", como na faixa de Configurações (RF-SP04).
export const formatSupportDeadline = (date: Date) => supportDateTime.format(date);

const SUPPORT_SETTINGS_PATH = "Configurações › Acesso do suporte";

export interface SupportGrantSummary {
  reason: string;
  ticket: string | null;
  scopeNames: string[];
  canWrite: boolean;
  writeJustification: string | null;
}

function supportGrantLines(grant: SupportGrantSummary) {
  return [
    `Motivo: ${grant.reason}`,
    grant.ticket ? `Chamado: ${grant.ticket}` : null,
    `Módulos: ${grant.scopeNames.join(", ")}`,
    grant.canWrite
      ? `Pode alterar dados: sim (${grant.writeJustification ?? "sem justificativa"})`
      : "Somente leitura. Notas pastorais nunca são acessadas.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Pedido do suporte pelo back-office: vai para quem pode autorizar (RF-SP01).
export function supportRequestNotice(input: {
  to: string;
  name: string;
  churchName: string;
  agentName: string;
  durationHours: number;
  answerBy: Date;
  grant: SupportGrantSummary;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "O suporte do iEzer pediu acesso aos dados da sua igreja",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `${input.agentName}, do suporte do iEzer, pediu acesso aos dados da ${input.churchName} por ${input.durationHours} horas, ` +
      `contadas a partir da aprovação.\n\n` +
      `${supportGrantLines(input.grant)}\n\n` +
      `Nada é visto antes de um administrador autorizar. Para aprovar ou recusar, abra ${SUPPORT_SETTINGS_PATH} no iEzer ` +
      `até ${formatSupportDeadline(input.answerBy)}; depois disso, o pedido expira.` +
      SIGNATURE,
  };
}

// Autorização (pedido aprovado ou dada pelo admin): todos os admins são avisados (RF-SP03).
export function supportAuthorizedNotice(input: {
  to: string;
  name: string;
  churchName: string;
  authorizedBy: string;
  expiresAt: Date;
  grant: SupportGrantSummary;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Acesso do suporte do iEzer autorizado",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `${input.authorizedBy} autorizou o suporte do iEzer a acessar os dados da ${input.churchName} ` +
      `até ${formatSupportDeadline(input.expiresAt)}.\n\n` +
      `${supportGrantLines(input.grant)}\n\n` +
      `Tudo o que o suporte abrir ou alterar aparece em Configurações › Auditoria, no filtro "Suporte iEzer". ` +
      `Para encerrar antes do prazo, use "Revogar" em ${SUPPORT_SETTINGS_PATH}.` +
      SIGNATURE,
  };
}

// Emergência com dupla aprovação interna: aviso imediato ao responsável pela conta e aos admins (RF-SP09).
export function supportEmergencyNotice(input: {
  to: string;
  name: string;
  churchName: string;
  kindLabel: string;
  approvers: string[];
  expiresAt: Date;
  grant: SupportGrantSummary;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Acesso de emergência do suporte do iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `O suporte do iEzer abriu um acesso de emergência aos dados da ${input.churchName} (${input.kindLabel}), ` +
      `aprovado por ${input.approvers.join(" e ")}, até ${formatSupportDeadline(input.expiresAt)}.\n\n` +
      `${supportGrantLines(input.grant)}\n\n` +
      `Tudo o que o suporte abrir ou alterar aparece em Configurações › Auditoria, no filtro "Suporte iEzer". ` +
      `Em caso de dúvida, fale com o iEzer.` +
      SIGNATURE,
  };
}

// Recuperação de admin (RF-SP10): a nomeação é avisada a todos os admins e ao responsável pela conta.
export function adminRecoveryNotice(input: {
  to: string;
  name: string;
  churchName: string;
  adminName: string;
  agentName: string;
  viaInvite: boolean;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Novo administrador nomeado pelo suporte do iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `A pedido do responsável pela conta da ${input.churchName}, o suporte do iEzer (${input.agentName}) ` +
      `nomeou ${input.adminName} como administrador(a), com o perfil Pastor na sede` +
      (input.viaInvite ? `; o convite foi enviado para o e-mail informado.` : `.`) +
      `\n\nSe você não reconhece esse pedido, fale com o iEzer imediatamente.` +
      SIGNATURE,
  };
}

// Ação da equipe sem acesso aos dados (B9, RF-BO32): o responsável pela conta é avisado, com o
// motivo e o chamado. action completa a frase "o suporte do iEzer (nome) ...".
export function teamActionNotice(input: {
  to: string;
  name: string;
  churchName: string;
  agentName: string;
  action: string;
  reason: string;
  ticket: string | null;
}): MailMessage {
  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Ação do suporte do iEzer na conta da sua igreja",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Como responsável pela conta da ${input.churchName}, avisamos que o suporte do iEzer ` +
      `(${input.agentName}) ${input.action}.\n\n` +
      `Motivo: ${input.reason}` +
      (input.ticket ? `\nChamado: ${input.ticket}` : "") +
      `\n\nA ação está registrada na Auditoria da igreja, no filtro "Suporte iEzer". ` +
      `Se você não reconhece esse pedido, fale com o iEzer imediatamente.` +
      SIGNATURE,
  };
}

// Situação da igreja mudada pela equipe (RF-BO19 a RF-BO21). Suspensão vai ao responsável pela
// conta e aos admins; ativação e reativação, ao responsável.
export function churchStatusNotice(input: {
  to: string;
  name: string;
  churchName: string;
  change: "ATIVADA" | "SUSPENSA" | "REATIVADA";
  reason: string | null;
}): MailMessage {
  const subjects = {
    ATIVADA: "A conta da sua igreja no iEzer está ativa",
    SUSPENSA: "O acesso da sua igreja ao iEzer foi suspenso",
    REATIVADA: "O acesso da sua igreja ao iEzer foi reativado",
  } as const;
  const bodies = {
    ATIVADA: `A implantação da ${input.churchName} no iEzer foi concluída e a conta passou a Ativa.`,
    SUSPENSA:
      `O acesso da ${input.churchName} ao iEzer foi suspenso pela equipe iEzer. As sessões abertas foram ` +
      `encerradas e ninguém da igreja consegue entrar enquanto durar a suspensão. Os dados continuam guardados.`,
    REATIVADA: `O acesso da ${input.churchName} ao iEzer foi reativado. Todos os usuários ativos já podem entrar de novo.`,
  } as const;

  return {
    to: input.to,
    churchName: input.churchName,
    subject: subjects[input.change],
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      bodies[input.change] +
      (input.reason ? `\n\nMotivo: ${input.reason}` : "") +
      `\n\nEm caso de dúvida, fale com o iEzer.` +
      SIGNATURE,
  };
}

// Troca do responsável pela conta (RF-BO26): avisa o anterior, o novo e os admins da igreja.
export function accountOwnerChangedNotice(input: {
  to: string;
  name: string;
  churchName: string;
  recipient: "ANTERIOR" | "NOVO" | "ADMIN";
  previousName: string;
  newName: string;
  document: string;
}): MailMessage {
  const lead = {
    ANTERIOR: `Você deixou de ser o(a) responsável pela conta da ${input.churchName} no iEzer. Quem responde pela conta agora é ${input.newName}.`,
    NOVO: `Você passou a ser o(a) responsável pela conta da ${input.churchName} no iEzer, no lugar de ${input.previousName}. É com você que o iEzer fala sobre contrato, suspensão e devolução dos dados.`,
    ADMIN: `O responsável pela conta da ${input.churchName} no iEzer mudou: saiu ${input.previousName} e entrou ${input.newName}.`,
  } as const;

  return {
    to: input.to,
    churchName: input.churchName,
    subject: "Troca do responsável pela conta no iEzer",
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      lead[input.recipient] +
      `\n\nDocumento apresentado: ${input.document}.` +
      `\n\nA troca está registrada na Auditoria da igreja. Se você não reconhece essa mudança, fale com o iEzer imediatamente.` +
      SIGNATURE,
  };
}

const announcementDateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Aviso da equipe que entrou no ar (RF-BO46): aos admins e ao responsável pela conta. Sai como
// "iEzer", não em nome da igreja.
export function announcementEmail(input: {
  to: string;
  name: string | null;
  churchName: string;
  levelLabel: string;
  title: string;
  body: string;
  linkUrl: string | null;
  endsAt: Date;
}): MailMessage {
  return {
    to: input.to,
    subject: `Aviso do iEzer: ${input.title}`,
    text:
      (input.name ? `Olá, ${firstName(input.name)}!\n\n` : "Olá!\n\n") +
      `A equipe do iEzer publicou um aviso (${input.levelLabel.toLowerCase()}) para a ${input.churchName}:\n\n` +
      `${input.title}\n${input.body}` +
      (input.linkUrl ? `\n\nSaiba mais: ${input.linkUrl}` : "") +
      `\n\nO aviso aparece no topo do iEzer até ${announcementDateTime.format(input.endsAt)} (horário de Brasília).` +
      `\n\n—\nEquipe iEzer\nVocê recebe este e-mail como admin ou responsável pela conta da igreja.`,
  };
}

export const exportDownloadUrl = (token: string) => `${env.WEB_ORIGIN}/exportacao/${token}`;

// Exportação de fim de contrato pronta (B14, RF-BO23): só ao responsável pela conta, com o link de
// uso único. A equipe não recebe cópia.
export function churchExportReadyEmail(input: {
  to: string;
  name: string;
  churchName: string;
  token: string;
  expiresAt: Date;
}): MailMessage {
  return {
    to: input.to,
    subject: `Dados da ${input.churchName} prontos para baixar`,
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Como responsável pela conta da ${input.churchName} no iEzer, você recebe a exportação completa dos dados ` +
      `da igreja: planilhas de pessoas, famílias, ciclo de vida e acompanhamentos, contribuições, contas a pagar e a ` +
      `receber, cadastros financeiros, usuários e perfis e a Auditoria, num arquivo .zip.\n\n` +
      `Para baixar, abra o link abaixo. Ele só pode ser usado uma vez e vale até ` +
      `${announcementDateTime.format(input.expiresAt)} (horário de Brasília); depois disso o arquivo é apagado:\n` +
      `${exportDownloadUrl(input.token)}\n\n` +
      `Guarde o arquivo em lugar seguro: ele traz dados pessoais dos membros. A equipe iEzer não tem acesso a ele, ` +
      `e o download fica registrado na Auditoria da igreja.` +
      SIGNATURE,
  };
}

// Comprovante da eliminação definitiva (RF-BO24, RF-BO60), ao responsável pela conta.
export function churchErasureNotice(input: {
  to: string;
  name: string;
  churchName: string;
  erasedAt: string;
  document: string;
  backupRetentionDays: number;
}): MailMessage {
  return {
    to: input.to,
    subject: `Comprovante de eliminação dos dados da ${input.churchName}`,
    text:
      `Olá, ${firstName(input.name)}!\n\n` +
      `Encerramos a conta da ${input.churchName} no iEzer. Em ${input.erasedAt}, os dados da igreja foram eliminados ` +
      `de forma definitiva: pessoas, famílias, acompanhamentos, lançamentos financeiros, cadastros, usuários e o ` +
      `histórico de alterações.\n\n` +
      `Documento de referência: ${input.document}.\n\n` +
      `Ficam guardados só o cadastro da igreja (nome, CNPJ e contatos da conta), os documentos do contrato pelo prazo ` +
      `legal de 5 anos e o registro do que a equipe iEzer fez na conta, sem dados de pessoas. As cópias de segurança ` +
      `automáticas do banco de dados expiram sozinhas em até ${input.backupRetentionDays} dias.\n\n` +
      `Este e-mail é o comprovante da eliminação. Em caso de dúvida, fale com o iEzer.` +
      SIGNATURE,
  };
}

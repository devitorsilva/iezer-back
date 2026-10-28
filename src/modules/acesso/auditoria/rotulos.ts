import type { AuditActorType, ModuleKey } from "@prisma/client";

// Rótulos da Auditoria (RF-LP02) e da aba Histórico, usados também na exportação: a tela e a
// planilha dizem a mesma coisa. Chave sem rótulo aparece como está.

export const MODULE_LABELS: Record<ModuleKey, string> = {
  LOGIN: "Login",
  CADASTRO: "Cadastro",
  FINANCEIRO: "Financeiro",
  RELATORIOS: "Relatórios",
  MENSAGERIA: "Mensageria",
  COMPRAS: "Compras",
  PATRIMONIO: "Patrimônio",
  MEMBROS: "Membros",
  CONFIGURACOES: "Configurações",
  PORTAL_TRANSPARENCIA: "Portal da transparência",
  CONTEUDO: "Conteúdo",
  ACESSO: "Acesso",
  PESSOAS: "Pessoas",
  BACKOFFICE: "Back-office",
};

export const ACTOR_TYPE_LABELS: Record<AuditActorType, string> = {
  USUARIO: "Usuário",
  SUPORTE: "Suporte iEzer",
  SISTEMA: "Sistema",
};

export const ACTION_LABELS: Record<string, string> = {
  // Genéricas (o tipo do registro completa o sentido).
  criar: "Criação",
  editar: "Edição",
  excluir: "Exclusão",
  apagar: "Exclusão",
  baixar: "Baixa",
  renomear: "Renomeação",
  // Login
  login: "Login",
  login_falhou: "Falha de login",
  logout: "Logout",
  login_bloqueado: "Login bloqueado",
  redefinir_senha: "Redefinição de senha",
  aceitar_termos: "Aceite dos termos",
  // Minha conta
  trocar_senha: "Senha trocada",
  definir_senha: "Senha definida",
  ativar_2fa: "Verificação em duas etapas ativada",
  desativar_2fa: "Verificação em duas etapas desativada",
  encerrar_sessao: "Sessão encerrada",
  encerrar_outras_sessoes: "Outras sessões encerradas",
  trocar_email: "E-mail de login trocado",
  // Acesso
  criar_convite: "Convite criado",
  reenviar_convite: "Convite reenviado",
  gerar_link_convite: "Link do convite gerado",
  cancelar_convite: "Convite cancelado",
  trocar_email_convite: "E-mail do convite trocado",
  aceitar_convite: "Convite aceito",
  editar_acessos_usuario: "Acessos do usuário editados",
  encerrar_sessoes_usuario: "Sessões encerradas",
  desativar_usuario: "Usuário desativado",
  reativar_usuario: "Usuário reativado",
  suspender_usuario: "Usuário suspenso",
  trocar_email_usuario: "E-mail do usuário trocado",
  redefinir_2fa: "Verificação em duas etapas redefinida",
  reconfigurar_2fa: "App autenticador reconfigurado",
  atribuir_perfil: "Perfil atribuído",
  criar_perfil: "Perfil criado",
  editar_perfil: "Perfil editado",
  restaurar_perfil: "Perfil restaurado",
  excluir_perfil: "Perfil excluído",
  exportar_auditoria: "Auditoria exportada",
  // Acesso do suporte
  suporte_pedir: "Suporte pediu acesso",
  suporte_autorizar: "Acesso do suporte autorizado",
  suporte_aprovar: "Pedido do suporte aprovado",
  suporte_recusar: "Pedido do suporte recusado",
  suporte_revogar: "Acesso do suporte revogado",
  suporte_encerrar: "Acesso do suporte encerrado",
  suporte_cancelar: "Pedido do suporte cancelado",
  suporte_emergencia_pedir: "Emergência do suporte pedida",
  suporte_emergencia_aprovar: "Emergência do suporte aprovada",
  suporte_recuperar_admin: "Admin nomeado pelo suporte",
  suporte_ler: "Suporte abriu tela ou registro",
  suporte_reenviar_convite: "Convite de admin reenviado pelo suporte",
  // Equipe iEzer (back-office; só na auditoria interna)
  convidar_equipe: "Membro da equipe convidado",
  reenviar_convite_equipe: "Convite da equipe reenviado",
  cancelar_convite_equipe: "Convite da equipe cancelado",
  aceitar_convite_equipe: "Convite da equipe aceito",
  alterar_papeis_equipe: "Papéis da equipe alterados",
  desativar_equipe: "Membro da equipe desativado",
  reativar_equipe: "Membro da equipe reativado",
  redefinir_autenticador_equipe: "App autenticador da equipe redefinido",
  aceitar_termo_equipe: "Termo da equipe aceito",
  promover_administrador_equipe: "Administrador iEzer criado pelo script",
  // Pessoas
  editar_pessoa: "Pessoa editada",
  apagar_registro: "Registro apagado",
  registrar_consentimento: "Consentimento registrado",
  adicionar_membro: "Membro adicionado",
  remover_membro: "Membro removido",
  trocar_papel: "Papel na família trocado",
  definir_contato_principal: "Contato principal definido",
  promover_vinculo: "Mudança de estágio",
  inativar: "Inativação",
  transferir: "Transferência",
  desligar: "Desligamento",
  registrar_falecimento: "Falecimento registrado",
  reativar: "Reativação",
  registrar_acompanhamento: "Acompanhamento registrado",
  importar: "Importação de planilha",
  // Organização
  criar_igreja: "Igreja criada",
  completar_igreja: "Igreja completada",
  editar_sede: "Sede editada",
  criar_congregacao: "Congregação criada",
  editar_congregacao: "Congregação editada",
  desativar_congregacao: "Congregação desativada",
  reativar_congregacao: "Congregação reativada",
  editar_encarregado_lgpd: "Encarregado de LGPD editado",
  editar_responsavel_conta: "Contato do responsável pela conta editado",
  remover_encarregado_lgpd: "Encarregado de LGPD removido",
  conferir_congregacoes: "Congregações conferidas",
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  Person: "Pessoa",
  Family: "Família",
  FollowUp: "Acompanhamento",
  PersonConsent: "Consentimento",
  PersonImport: "Importação",
  User: "Usuário",
  Invite: "Convite",
  AccessProfile: "Perfil de acesso",
  UserAssignment: "Atribuição",
  Organization: "Organização",
  OrganizationContact: "Contato da organização",
  Supplier: "Fornecedor",
  Category: "Categoria",
  BankAccount: "Conta bancária",
  CostCenter: "Centro de custo",
  Payable: "Conta a pagar",
  Receivable: "Conta a receber",
  ChurchListItem: "Lista da igreja",
  AuditLog: "Auditoria",
  SupportGrant: "Acesso do suporte",
  TeamMember: "Membro da equipe",
  TeamInvite: "Convite da equipe",
  Rota: "Tela ou registro",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  preferredName: "Apelido",
  legalName: "Razão social",
  description: "Descrição",
  email: "E-mail",
  phone: "Telefone",
  mobilePhone: "Celular",
  mobileIsWhatsapp: "Celular é WhatsApp",
  secondaryPhone: "Telefone secundário",
  primaryContactPersonId: "Contato principal",
  cpf: "CPF",
  cnpj: "CNPJ",
  otherDocumentType: "Outro documento",
  otherDocumentNumber: "Número do documento",
  sex: "Sexo",
  maritalStatus: "Estado civil",
  birthDate: "Nascimento",
  bond: "Vínculo",
  bondSince: "No vínculo desde",
  status: "Situação",
  ticket: "Chamado",
  scope: "Módulos",
  canWrite: "Pode alterar dados",
  writeJustification: "Justificativa da escrita",
  durationHours: "Prazo (horas)",
  closeReason: "Motivo do encerramento",
  emergencyKind: "Tipo de emergência",
  origin: "Origem",
  viaInvite: "Por convite",
  url: "Endereço",
  organizationName: "Organização",
  firstVisitDate: "Primeira visita",
  conversionDate: "Conversão",
  presentationDate: "Apresentação",
  isBaptized: "Batizado",
  baptismDate: "Batismo",
  baptismChurch: "Igreja do batismo",
  infantBaptism: "Batismo infantil",
  professionOfFaithDate: "Profissão de fé",
  admissionDate: "Admissão",
  admissionMethodName: "Forma de admissão",
  originChurch: "Igreja de origem",
  cellName: "Célula",
  notes: "Observações",
  postalCode: "CEP",
  street: "Logradouro",
  number: "Número",
  complement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
  contactUpdatedAt: "Contato atualizado em",
  role: "Papel",
  members: "Membros",
  date: "Data",
  type: "Tipo",
  kind: "Tipo",
  note: "Anotação",
  authorName: "Autor",
  purpose: "Finalidade",
  method: "Forma",
  textVersion: "Versão do texto",
  fileName: "Arquivo",
  templateVersion: "Versão do modelo",
  criadas: "Criadas",
  atualizadas: "Atualizadas",
  puladas: "Puladas",
  recusadas: "Recusadas",
  refusedLines: "Linhas recusadas",
  declaration: "Declaração",
  declarationVersion: "Versão da declaração",
  givenAt: "Dado em",
  revokedAt: "Revogado em",
  personName: "Pessoa",
  invitedByName: "Convidado por",
  expiresAt: "Expira em",
  acceptedAt: "Aceito em",
  assignments: "Acessos",
  termsVersion: "Versão dos termos",
  roles: "Papéis",
  twoFactorEnabled: "Verificação em duas etapas",
  lockedUntil: "Bloqueado até",
  permissions: "Permissões",
  factoryKey: "Perfil de fábrica",
  userCount: "Usuários",
  inviteCount: "Convites",
  movedToProfileName: "Movido para o perfil",
  profile: "Perfil",
  organization: "Organização",
  isActive: "Ativo",
  jobTitle: "Cargo",
  accountOwner: "Responsável pela conta",
  lgpdOfficer: "Encarregado de LGPD",
  congregations: "Congregações",
  congregationsReviewedAt: "Congregações conferidas em",
  amount: "Valor",
  dueDate: "Vencimento",
  baseDate: "Data base",
  categoryName: "Categoria",
  supplierName: "Fornecedor",
  source: "Origem",
  settledAmount: "Valor da baixa",
  settledAt: "Data da baixa",
  settlementMethod: "Forma da baixa",
  settlementBankAccountName: "Conta da baixa",
  isRecurring: "Recorrente",
  recurrenceFrequency: "Frequência",
  recurrenceCount: "Parcelas",
  bankName: "Banco",
  accountName: "Nome da conta",
  accountType: "Tipo de conta",
  agency: "Agência",
  accountNumber: "Número da conta",
  pixKey: "Chave PIX",
  openingBalance: "Saldo inicial",
  code: "Código",
  reason: "Motivo",
  filters: "Filtros",
  rows: "Linhas",
  truncated: "Cortada no limite",
  // Filtros da exportação.
  autor: "Autor",
  pessoa: "Pessoa",
  modulo: "Módulo",
  acao: "Ação",
  organizacao: "Organização",
  de: "De",
  ate: "Até",
  suporte: "Suporte iEzer",
};

const VALUE_LABELS: Record<string, string> = {
  VISITANTE: "Visitante",
  NOVO_CONVERTIDO: "Novo convertido",
  CONGREGADO: "Congregado",
  MEMBRO: "Membro",
  MEMBRO_EM_FORMACAO: "Membro em formação",
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  TRANSFERIDO: "Transferido",
  DESLIGADO: "Desligado",
  FALECIDO: "Falecido",
  SUSPENSO: "Suspenso",
  DESATIVADO: "Desativado",
  PENDENTE: "Pendente",
  PAGO: "Pago",
  RECEBIDO: "Recebido",
  CANCELADO: "Cancelado",
  ACEITO: "Aceito",
  EXPIRADO: "Expirado",
  RESPONSAVEL: "Responsável",
  CONJUGE: "Cônjuge",
  FILHO: "Filho(a)",
  ATRASADO: "Atrasado",
  LIGACAO: "Ligação",
  QUINZENAL: "Quinzenal",
  MASCULINO: "Masculino",
  FEMININO: "Feminino",
  UNIAO_ESTAVEL: "União estável",
  VIUVO: "Viúvo(a)",
  CERTIDAO_NASCIMENTO: "Certidão de nascimento",
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos",
  USER_INACTIVE: "Acesso desativado",
  AGUARDANDO_SEGUNDA_APROVACAO: "Aguardando segunda aprovação",
  RECUSADO: "Recusado",
  REVOGADO: "Revogado",
  ENCERRADO: "Encerrado",
  PEDIDO_SUPORTE: "Pedido do suporte",
  AUTORIZACAO_ADMIN: "Autorização do admin",
  EMERGENCIA: "Emergência",
  INCIDENTE: "Incidente",
  ORDEM_JUDICIAL: "Ordem judicial",
  IGREJA_SEM_ADMIN: "Igreja sem administrador",
};

// Campos técnicos ou derivados: não aparecem nas alterações.
const HIDDEN_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "organizationId",
  "searchName",
  "age",
  "incomplete",
  "missingFields",
  "promotionRequirements",
  "lastFollowUp",
  "family",
  "consent",
  "familyId",
  "recurrenceGroupId",
  "recordedByUserId",
  "index",
  "kind",
  "authorName",
  "grantId",
]);

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ENUM_VALUE = /^[A-Z][A-Z0-9_]+$/;
const MAX_VALUE_LENGTH = 300;

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

export function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

export function targetTypeLabel(targetType: string | null) {
  return targetType ? (TARGET_TYPE_LABELS[targetType] ?? targetType) : null;
}

export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

function enumLabel(value: string) {
  if (VALUE_LABELS[value]) return VALUE_LABELS[value];
  const text = value.toLowerCase().replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return value.toLocaleString("pt-BR");

  if (typeof value === "string") {
    if (CIVIL_DATE.test(value)) return value.split("-").reverse().join("/");
    if (ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))) return formatDateTime(new Date(value));
    if (ENUM_VALUE.test(value)) return enumLabel(value);
    return truncate(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((item) => typeof item !== "object" || item === null)) {
      return truncate(value.map(formatValue).join(", "));
    }
    return truncate(value.map(formatValue).join("; "));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") return truncate(record.name);
    if (typeof record.personName === "string") return truncate(record.personName);
    return truncate(
      Object.entries(record)
        .filter(([key]) => !HIDDEN_FIELDS.has(key) && !key.endsWith("Id"))
        .map(([key, item]) => `${FIELD_LABELS[key] ?? key}: ${formatValue(item)}`)
        .join(", "),
    );
  }

  return truncate(String(value));
}

function truncate(text: string) {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}

export interface AuditChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Campos alterados com antes e depois formatados. Serve tanto para o log minimizado (só os
// campos que mudaram) quanto para os registros antigos, que guardavam o retrato inteiro.
// `fooId` com `fooName` ao lado fica só com o nome.
export function describeChanges(before: unknown, after: unknown): AuditChange[] {
  const beforeRecord = asRecord(before);
  const afterRecord = asRecord(after);
  if (!beforeRecord && !afterRecord) return [];

  const keys = [...new Set([...Object.keys(beforeRecord ?? {}), ...Object.keys(afterRecord ?? {})])];
  const changes: AuditChange[] = [];

  for (const key of keys) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (key.endsWith("Id") && keys.includes(`${key.slice(0, -2)}Name`)) continue;

    const oldValue = beforeRecord?.[key];
    const newValue = afterRecord?.[key];
    if (beforeRecord && afterRecord && JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) {
      continue;
    }

    changes.push({
      field: key,
      label: FIELD_LABELS[key] ?? key,
      before: beforeRecord ? formatValue(oldValue) : null,
      after: afterRecord ? formatValue(newValue) : null,
    });
  }

  return changes;
}

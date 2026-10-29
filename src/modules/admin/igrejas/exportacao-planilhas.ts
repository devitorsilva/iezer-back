import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { prisma } from "../../../lib/prisma.js";
import { enumLabel, formatDateTime } from "../../acesso/auditoria/rotulos.js";
import { auditRowSelect } from "../../acesso/auditoria/repository.js";
import { auditService } from "../../acesso/auditoria/routes.js";
import { AUDIT_EXPORT_HEADER, auditEntryValues } from "../../acesso/auditoria/service.js";

// Planilhas da exportação de fim de contrato (RF-BO22): um .xlsx por conjunto, várias abas quando o
// conjunto tem partes, todas no mesmo .zip com um LEIA-ME. Colunas de ID ligam as abas (pessoa da
// família, do acompanhamento, da conta a receber). Notas pastorais (F2 de Pessoas) ainda não existem;
// quando existirem, vão num arquivo à parte, só para quem tem a permissão (RF-BO23), fora deste .zip.

type Cell = string | number | boolean | Date | null | undefined;

interface Sheet {
  name: string;
  columns: { header: string; width?: number; format?: "date" | "money" }[];
  rows: Cell[][];
}

interface Dataset {
  file: string;
  label: string;
  sheets: Sheet[];
}

// Data civil (@db.Date, meia-noite UTC): o Excel mostra o dia sem fuso.
const civil = (date: Date | null | undefined) => date ?? null;
const dateTime = (date: Date | null | undefined) => (date ? formatDateTime(date) : null);
const label = (value: string | null | undefined) => (value ? enumLabel(value) : null);
const yesNo = (value: boolean) => (value ? "Sim" : "Não");
const money = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : Number(value));

const AUDIT_BATCH = 2_000;

async function churchOrganizations(churchId: string) {
  return prisma.organization.findMany({
    where: { OR: [{ id: churchId }, { parentId: churchId }] },
    select: { id: true, name: true, type: true, cnpj: true, isActive: true, createdAt: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

async function organizationDataset(churchId: string, orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const [organizations, contacts, lists] = await Promise.all([
    churchOrganizations(churchId),
    prisma.organizationContact.findMany({ where: { organizationId: { in: orgIds } }, orderBy: { role: "asc" } }),
    prisma.churchListItem.findMany({
      where: { organizationId: { in: orgIds } },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return {
    file: "organizacao.xlsx",
    label: "Organização",
    sheets: [
      {
        name: "Organizações",
        columns: [{ header: "ID" }, { header: "Nome", width: 40 }, { header: "Tipo" }, { header: "CNPJ", width: 20 }, { header: "Ativa" }, { header: "Criada em", width: 18 }],
        rows: organizations.map((org) => [org.id, org.name, org.type === "SEDE" ? "Sede" : "Congregação", org.cnpj, yesNo(org.isActive), dateTime(org.createdAt)]),
      },
      {
        name: "Contatos da conta",
        columns: [{ header: "Organização", width: 30 }, { header: "Papel", width: 24 }, { header: "Nome", width: 30 }, { header: "Cargo" }, { header: "E-mail", width: 30 }, { header: "Telefone", width: 16 }],
        rows: contacts.map((contact) => [
          orgName(contact.organizationId),
          contact.role === "RESPONSAVEL_CONTA" ? "Responsável pela conta" : "Encarregado de LGPD",
          contact.name,
          contact.jobTitle,
          contact.email,
          contact.phone,
        ]),
      },
      {
        name: "Listas da igreja",
        columns: [{ header: "ID" }, { header: "Lista", width: 24 }, { header: "Nome", width: 30 }, { header: "Ordem" }, { header: "Ativo" }],
        rows: lists.map((item) => [item.id, label(item.type), item.name, item.sortOrder, yesNo(item.isActive)]),
      },
    ],
  };
}

async function peopleDataset(orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const [people, consents] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId: { in: orgIds } },
      include: { admissionMethod: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.personConsent.findMany({
      where: { organizationId: { in: orgIds } },
      include: { person: { select: { name: true } }, givenBy: { select: { name: true } } },
      orderBy: [{ personId: "asc" }, { givenAt: "asc" }],
    }),
  ]);

  return {
    file: "pessoas.xlsx",
    label: "Pessoas",
    sheets: [
      {
        name: "Pessoas",
        columns: [
          { header: "ID" }, { header: "Organização", width: 30 }, { header: "Nome", width: 34 }, { header: "Apelido" },
          { header: "Sexo" }, { header: "Nascimento", format: "date" }, { header: "Estado civil" }, { header: "CPF", width: 14 },
          { header: "Outro documento" }, { header: "Número do documento" }, { header: "Celular", width: 16 }, { header: "Celular é WhatsApp" },
          { header: "Telefone secundário", width: 16 }, { header: "E-mail", width: 30 }, { header: "CEP" }, { header: "Logradouro", width: 30 },
          { header: "Número" }, { header: "Complemento" }, { header: "Bairro" }, { header: "Cidade" }, { header: "UF" },
          { header: "Vínculo" }, { header: "No vínculo desde", format: "date" }, { header: "Situação" },
          { header: "Primeira visita", format: "date" }, { header: "Conversão", format: "date" }, { header: "Apresentação", format: "date" },
          { header: "Batizado" }, { header: "Batismo", format: "date" }, { header: "Igreja do batismo" }, { header: "Batismo infantil" },
          { header: "Profissão de fé", format: "date" }, { header: "Forma de admissão" }, { header: "Admissão", format: "date" },
          { header: "Igreja de origem" }, { header: "Célula" }, { header: "Observações", width: 40 }, { header: "Cadastrada em", width: 18 },
        ],
        rows: people.map((person) => [
          person.id, orgName(person.organizationId), person.name, person.preferredName,
          label(person.sex), civil(person.birthDate), label(person.maritalStatus), person.cpf,
          label(person.otherDocumentType), person.otherDocumentNumber, person.mobilePhone, yesNo(person.mobileIsWhatsapp),
          person.secondaryPhone, person.email, person.postalCode, person.street,
          person.number, person.complement, person.district, person.city, person.state,
          label(person.bond), civil(person.bondSince), label(person.status),
          civil(person.firstVisitDate), civil(person.conversionDate), civil(person.presentationDate),
          yesNo(person.isBaptized), civil(person.baptismDate), person.baptismChurch, yesNo(person.infantBaptism),
          civil(person.professionOfFaithDate), person.admissionMethod?.name, civil(person.admissionDate),
          person.originChurch, person.cellName, person.notes, dateTime(person.createdAt),
        ]),
      },
      {
        name: "Consentimentos",
        columns: [
          { header: "ID da pessoa" }, { header: "Pessoa", width: 34 }, { header: "Finalidade" }, { header: "Dado por", width: 30 },
          { header: "Forma" }, { header: "Versão do texto" }, { header: "Dado em", width: 18 }, { header: "Revogado em", width: 18 },
        ],
        rows: consents.map((consent) => [
          consent.personId, consent.person.name, label(consent.purpose), consent.givenBy?.name ?? "O próprio titular",
          label(consent.method), consent.textVersion, dateTime(consent.givenAt), dateTime(consent.revokedAt),
        ]),
      },
    ],
  };
}

async function familyDataset(orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const [families, relations] = await Promise.all([
    prisma.family.findMany({
      where: { organizationId: { in: orgIds } },
      include: {
        primaryContact: { select: { name: true } },
        members: { include: { person: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.personRelation.findMany({
      where: { organizationId: { in: orgIds } },
      include: { person: { select: { name: true } }, relative: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    file: "familias.xlsx",
    label: "Famílias",
    sheets: [
      {
        name: "Famílias",
        columns: [{ header: "ID" }, { header: "Organização", width: 30 }, { header: "Nome", width: 30 }, { header: "Contato principal", width: 30 }, { header: "Membros" }, { header: "Criada em", width: 18 }],
        rows: families.map((family) => [
          family.id, orgName(family.organizationId), family.name, family.primaryContact?.name, family.members.length, dateTime(family.createdAt),
        ]),
      },
      {
        name: "Membros",
        columns: [{ header: "ID da família" }, { header: "Família", width: 30 }, { header: "ID da pessoa" }, { header: "Pessoa", width: 34 }, { header: "Papel" }, { header: "Entrou em", width: 18 }],
        rows: families.flatMap((family) =>
          family.members.map((member) => [family.id, family.name, member.personId, member.person.name, label(member.role), dateTime(member.createdAt)]),
        ),
      },
      {
        name: "Parentesco",
        columns: [{ header: "ID da pessoa" }, { header: "Pessoa", width: 34 }, { header: "Parentesco" }, { header: "ID do parente" }, { header: "Parente", width: 34 }],
        rows: relations.map((relation) => [
          relation.personId,
          relation.person.name,
          relation.type === "PAI_MAE" ? "Pai ou mãe de" : "Cônjuge de",
          relation.relativeId,
          relation.relative.name,
        ]),
      },
    ],
  };
}

async function lifecycleDataset(orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const [events, followUps] = await Promise.all([
    prisma.personEvent.findMany({
      where: { organizationId: { in: orgIds } },
      include: { person: { select: { name: true } }, reason: { select: { name: true } }, author: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.followUp.findMany({
      where: { organizationId: { in: orgIds } },
      include: { person: { select: { name: true } }, author: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return {
    file: "ciclo-de-vida-e-acompanhamentos.xlsx",
    label: "Ciclo de vida e acompanhamentos",
    sheets: [
      {
        name: "Ciclo de vida",
        columns: [
          { header: "Organização", width: 30 }, { header: "ID da pessoa" }, { header: "Pessoa", width: 34 }, { header: "Evento" },
          { header: "Data", format: "date" }, { header: "Vínculo anterior" }, { header: "Vínculo novo" }, { header: "Situação anterior" },
          { header: "Situação nova" }, { header: "Motivo", width: 24 }, { header: "Observação", width: 40 }, { header: "Detalhes", width: 40 },
          { header: "Registrado por", width: 30 }, { header: "Registrado em", width: 18 },
        ],
        rows: events.map((event) => [
          orgName(event.organizationId), event.personId, event.person.name, label(event.type),
          civil(event.date), label(event.fromBond), label(event.toBond), label(event.fromStatus),
          label(event.toStatus), event.reason?.name, event.note, event.details ? JSON.stringify(event.details) : null,
          event.author.name, dateTime(event.createdAt),
        ]),
      },
      {
        name: "Acompanhamentos",
        columns: [
          { header: "Organização", width: 30 }, { header: "ID da pessoa" }, { header: "Pessoa", width: 34 }, { header: "Data", format: "date" },
          { header: "Tipo" }, { header: "Anotação", width: 50 }, { header: "Autor", width: 30 }, { header: "Registrado em", width: 18 },
        ],
        rows: followUps.map((followUp) => [
          orgName(followUp.organizationId), followUp.personId, followUp.person.name, civil(followUp.date),
          label(followUp.type), followUp.note, followUp.author.name, dateTime(followUp.createdAt),
        ]),
      },
    ],
  };
}

const settlementColumns: Sheet["columns"] = [
  { header: "Vencimento", format: "date" }, { header: "Valor", format: "money" }, { header: "Situação" },
  { header: "Valor da baixa", format: "money" }, { header: "Data da baixa", format: "date" }, { header: "Forma da baixa" },
  { header: "Conta da baixa", width: 24 }, { header: "Recorrente" }, { header: "Frequência" }, { header: "Parcelas" },
  { header: "Grupo de recorrência" }, { header: "Observações", width: 40 }, { header: "Criada em", width: 18 },
];

type SettlementRow = {
  dueDate: Date;
  amount: Prisma.Decimal;
  status: string;
  settledAmount: Prisma.Decimal | null;
  settledAt: Date | null;
  settlementMethod: string | null;
  settlementBankAccount: { accountName: string } | null;
  isRecurring: boolean;
  recurrenceFrequency: string | null;
  recurrenceCount: number | null;
  recurrenceGroupId: string | null;
  notes: string | null;
  createdAt: Date;
};

const settlementCells = (row: SettlementRow): Cell[] => [
  row.dueDate, money(row.amount), label(row.status),
  money(row.settledAmount), row.settledAt, row.settlementMethod,
  row.settlementBankAccount?.accountName, yesNo(row.isRecurring), label(row.recurrenceFrequency), row.recurrenceCount,
  row.recurrenceGroupId, row.notes, dateTime(row.createdAt),
];

async function receivablesDataset(orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const receivables = await prisma.receivable.findMany({
    where: { organizationId: { in: orgIds } },
    include: {
      person: { select: { name: true } },
      category: { select: { name: true } },
      settlementBankAccount: { select: { accountName: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return {
    file: "contribuicoes-e-contas-a-receber.xlsx",
    label: "Contribuições e contas a receber",
    sheets: [
      {
        name: "Contas a receber",
        columns: [
          { header: "ID" }, { header: "Organização", width: 30 }, { header: "Descrição", width: 34 }, { header: "Origem" },
          { header: "ID da pessoa" }, { header: "Pessoa", width: 34 }, { header: "Categoria", width: 24 }, ...settlementColumns,
        ],
        rows: receivables.map((item) => [
          item.id, orgName(item.organizationId), item.description, item.source,
          item.personId, item.person?.name, item.category?.name, ...settlementCells(item),
        ]),
      },
    ],
  };
}

async function payablesDataset(orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const payables = await prisma.payable.findMany({
    where: { organizationId: { in: orgIds } },
    include: {
      supplier: { select: { name: true } },
      category: { select: { name: true } },
      settlementBankAccount: { select: { accountName: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return {
    file: "contas-a-pagar.xlsx",
    label: "Contas a pagar",
    sheets: [
      {
        name: "Contas a pagar",
        columns: [
          { header: "ID" }, { header: "Organização", width: 30 }, { header: "Descrição", width: 34 },
          { header: "Fornecedor", width: 30 }, { header: "Categoria", width: 24 }, ...settlementColumns,
        ],
        rows: payables.map((item) => [
          item.id, orgName(item.organizationId), item.description, item.supplier?.name, item.category?.name, ...settlementCells(item),
        ]),
      },
    ],
  };
}

async function financialRegistryDataset(orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const where = { organizationId: { in: orgIds } };
  const [categories, costCenters, bankAccounts, suppliers] = await Promise.all([
    prisma.category.findMany({ where, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where, orderBy: [{ bankName: "asc" }, { accountName: "asc" }] }),
    prisma.supplier.findMany({ where, orderBy: { name: "asc" } }),
  ]);

  return {
    file: "cadastros-financeiros.xlsx",
    label: "Cadastros financeiros",
    sheets: [
      {
        name: "Categorias",
        columns: [{ header: "Organização", width: 30 }, { header: "Nome", width: 30 }, { header: "Tipo" }, { header: "Descrição", width: 40 }, { header: "Ativa" }],
        rows: categories.map((item) => [orgName(item.organizationId), item.name, label(item.type), item.description, yesNo(item.isActive)]),
      },
      {
        name: "Centros de custo",
        columns: [{ header: "Organização", width: 30 }, { header: "Nome", width: 30 }, { header: "Código" }, { header: "Descrição", width: 40 }, { header: "Ativo" }],
        rows: costCenters.map((item) => [orgName(item.organizationId), item.name, item.code, item.description, yesNo(item.isActive)]),
      },
      {
        name: "Contas bancárias",
        columns: [
          { header: "Organização", width: 30 }, { header: "Banco", width: 24 }, { header: "Nome da conta", width: 24 }, { header: "Tipo" },
          { header: "Agência" }, { header: "Número" }, { header: "Chave PIX", width: 24 }, { header: "Saldo inicial", format: "money" },
          { header: "Observações", width: 40 }, { header: "Ativa" },
        ],
        rows: bankAccounts.map((item) => [
          orgName(item.organizationId), item.bankName, item.accountName, label(item.accountType),
          item.agency, item.accountNumber, item.pixKey, money(item.openingBalance), item.notes, yesNo(item.isActive),
        ]),
      },
      {
        name: "Fornecedores",
        columns: [
          { header: "Organização", width: 30 }, { header: "Nome", width: 30 }, { header: "Razão social", width: 30 }, { header: "CNPJ", width: 20 },
          { header: "E-mail", width: 30 }, { header: "Telefone", width: 16 }, { header: "Chave PIX", width: 24 }, { header: "Observações", width: 40 },
          { header: "Ativo" },
        ],
        rows: suppliers.map((item) => [
          orgName(item.organizationId), item.name, item.legalName, item.cnpj, item.email, item.phone, item.pixKey, item.notes, yesNo(item.isActive),
        ]),
      },
    ],
  };
}

async function usersDataset(churchId: string, orgIds: string[], orgName: (id: string) => string): Promise<Dataset> {
  const [users, profiles] = await Promise.all([
    prisma.user.findMany({
      where: {
        teamMember: null,
        OR: [
          { assignments: { some: { organizationId: { in: orgIds } } } },
          { person: { organizationId: { in: orgIds } } },
        ],
      },
      include: {
        assignments: {
          where: { organizationId: { in: orgIds } },
          include: { profile: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.accessProfile.findMany({
      where: { organizationId: churchId },
      include: { permissions: { select: { permissionKey: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    file: "usuarios-e-perfis.xlsx",
    label: "Usuários e perfis",
    sheets: [
      {
        name: "Usuários",
        columns: [{ header: "Nome", width: 30 }, { header: "E-mail", width: 30 }, { header: "Status" }, { header: "ID da pessoa" }, { header: "Último acesso", width: 18 }, { header: "Criado em", width: 18 }],
        rows: users.map((user) => [user.name, user.email, label(user.status), user.personId, dateTime(user.lastLoginAt), dateTime(user.createdAt)]),
      },
      {
        name: "Acessos",
        columns: [{ header: "Usuário", width: 30 }, { header: "E-mail", width: 30 }, { header: "Perfil", width: 24 }, { header: "Organização", width: 30 }],
        rows: users.flatMap((user) =>
          user.assignments.map((assignment) => [user.name, user.email, assignment.profile.name, orgName(assignment.organizationId)]),
        ),
      },
      {
        name: "Perfis",
        columns: [{ header: "Nome", width: 24 }, { header: "Descrição", width: 40 }, { header: "De fábrica" }, { header: "Permissões", width: 80 }],
        rows: profiles.map((profile) => [
          profile.name,
          profile.description,
          yesNo(profile.factoryKey !== null),
          profile.permissions.map((permission) => permission.permissionKey).sort().join(", "),
        ]),
      },
    ],
  };
}

// Auditoria da igreja inteira, com os mesmos rótulos da tela e do CSV, em lotes pelo cursor.
async function auditDataset(orgIds: string[]): Promise<Dataset> {
  const rows: Cell[][] = [];
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.auditLog.findMany({
      where: { organizationId: { in: orgIds } },
      select: auditRowSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: AUDIT_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;

    for (const entry of await auditService.mapRows(batch)) rows.push(auditEntryValues(entry));
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < AUDIT_BATCH) break;
  }

  return {
    file: "auditoria.xlsx",
    label: "Auditoria",
    sheets: [{ name: "Auditoria", columns: AUDIT_EXPORT_HEADER.map((header) => ({ header, width: 22 })), rows }],
  };
}

async function toWorkbook(dataset: Dataset) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "iEzer";

  for (const sheet of dataset.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      width: column.width ?? Math.max(12, column.header.length + 2),
      style:
        column.format === "date" ? { numFmt: "dd/mm/yyyy" } : column.format === "money" ? { numFmt: "#,##0.00" } : undefined,
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRows(sheet.rows.map((row) => row.map((cell) => cell ?? null)));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function readme(churchName: string, generatedAt: Date, datasets: Dataset[]) {
  const lines = [
    `Exportação dos dados da ${churchName} no iEzer`,
    `Gerada em ${formatDateTime(generatedAt)} (horário de Brasília).`,
    "",
    "Arquivos (uma planilha por conjunto; algumas têm mais de uma aba):",
    ...datasets.map(
      (dataset) =>
        `- ${dataset.file}: ${dataset.label} (${dataset.sheets.map((sheet) => `${sheet.name}: ${sheet.rows.length}`).join("; ")})`,
    ),
    "",
    "Como ler:",
    "- As colunas de ID ligam as planilhas (por exemplo, o ID da pessoa nos acompanhamentos e nas contas a receber).",
    "- Telefones vêm só com dígitos, com o código do país (55). CPF vem só com os 11 dígitos.",
    "- Datas e horas estão no horário de Brasília. Valores em reais.",
    "- Notas pastorais não fazem parte desta exportação.",
    "",
    "Este arquivo foi enviado só ao responsável pela conta. A equipe iEzer não tem acesso a ele.",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export interface ChurchExportFile {
  buffer: Buffer;
  datasets: Record<string, number>;
}

// Monta o .zip da igreja (sede e congregações). Lê tudo fora de transação: a igreja está suspensa,
// ninguém altera os dados enquanto a exportação roda.
export async function buildChurchExport(churchId: string, churchName: string, generatedAt: Date): Promise<ChurchExportFile> {
  const organizations = await churchOrganizations(churchId);
  const orgIds = organizations.map((org) => org.id);
  const names = new Map(organizations.map((org) => [org.id, org.name]));
  const orgName = (id: string) => names.get(id) ?? id;

  const datasets: Dataset[] = [];
  datasets.push(await organizationDataset(churchId, orgIds, orgName));
  datasets.push(await peopleDataset(orgIds, orgName));
  datasets.push(await familyDataset(orgIds, orgName));
  datasets.push(await lifecycleDataset(orgIds, orgName));
  datasets.push(await receivablesDataset(orgIds, orgName));
  datasets.push(await payablesDataset(orgIds, orgName));
  datasets.push(await financialRegistryDataset(orgIds, orgName));
  datasets.push(await usersDataset(churchId, orgIds, orgName));
  datasets.push(await auditDataset(orgIds));

  const zip = new JSZip();
  zip.file("LEIA-ME.txt", readme(churchName, generatedAt, datasets));
  for (const dataset of datasets) zip.file(dataset.file, await toWorkbook(dataset));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const counts: Record<string, number> = {};
  for (const dataset of datasets) {
    for (const sheet of dataset.sheets) counts[sheet.name] = sheet.rows.length;
  }
  return { buffer, datasets: counts };
}

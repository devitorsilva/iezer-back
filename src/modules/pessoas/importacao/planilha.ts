import type { MaritalStatus, OtherDocumentType, PersonBond, Sex } from "@prisma/client";
import ExcelJS from "exceljs";
import { z } from "zod";
import { isCivilDate, parseCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { isValidCpf, normalizeCpf } from "../../../lib/cpf.js";
import { AppError } from "../../../lib/errors.js";
import { normalizePhone } from "../../../lib/phone.js";
import { normalizeSearchText } from "../../../lib/text.js";

// Planilha modelo da importação de pessoas (RF-I01 a RF-I05). Mudou coluna ou lista fixa,
// muda a versão: modelo antigo é recusado (RF-I04).
export const TEMPLATE_VERSION = "pessoas-1";
export const MAX_ROWS = 2_000;

const PEOPLE_SHEET = "Pessoas";
const LISTS_SHEET = "Listas";
const META_SHEET = "_meta";

// A linha de exemplo (RF-I02) é ignorada na leitura, mesmo se não for apagada.
const EXAMPLE_NAME = "Maria Exemplo da Silva";

type ListKey = "VINCULO" | "SEXO" | "ESTADO_CIVIL" | "DOCUMENTO" | "SIM_NAO" | "UF" | "FORMA_ADMISSAO";

const COLUMNS = [
  { key: "nome", header: "Nome completo *", width: 34 },
  { key: "apelido", header: "Como prefere ser chamado", width: 22 },
  { key: "vinculo", header: "Vínculo *", width: 20, list: "VINCULO" },
  { key: "sexo", header: "Sexo", width: 13, list: "SEXO" },
  { key: "nascimento", header: "Data de nascimento", width: 16, date: true },
  { key: "estadoCivil", header: "Estado civil", width: 16, list: "ESTADO_CIVIL" },
  { key: "cpf", header: "CPF", width: 16 },
  { key: "outroDocumentoTipo", header: "Outro documento (tipo)", width: 22, list: "DOCUMENTO" },
  { key: "outroDocumentoNumero", header: "Outro documento (número)", width: 22 },
  { key: "celular", header: "Celular", width: 18 },
  { key: "celularWhatsapp", header: "Celular é WhatsApp (S/N)", width: 14, list: "SIM_NAO" },
  { key: "telefone", header: "Telefone secundário", width: 18 },
  { key: "email", header: "Email", width: 28 },
  { key: "cep", header: "CEP", width: 11 },
  { key: "logradouro", header: "Logradouro", width: 30 },
  { key: "numero", header: "Número", width: 9 },
  { key: "complemento", header: "Complemento", width: 16 },
  { key: "bairro", header: "Bairro", width: 18 },
  { key: "cidade", header: "Cidade", width: 18 },
  { key: "uf", header: "UF", width: 6, list: "UF" },
  { key: "primeiraVisita", header: "Data da primeira visita", width: 16, date: true },
  { key: "conversao", header: "Data de conversão", width: 16, date: true },
  { key: "batizado", header: "Batizado (S/N)", width: 12, list: "SIM_NAO" },
  { key: "batismo", header: "Data do batismo", width: 16, date: true },
  { key: "igrejaBatismo", header: "Igreja do batismo", width: 24 },
  { key: "profissaoFe", header: "Data da profissão de fé", width: 16, date: true },
  { key: "formaAdmissao", header: "Forma de admissão", width: 26, list: "FORMA_ADMISSAO" },
  { key: "admissao", header: "Data de admissão", width: 16, date: true },
  { key: "igrejaOrigem", header: "Igreja de origem", width: 24 },
  { key: "observacoes", header: "Observações", width: 30 },
  { key: "cpfResponsavel", header: "CPF do responsável", width: 18 },
  { key: "nomeResponsavel", header: "Nome do responsável", width: 30 },
  { key: "consentimento", header: "Consentimento coletado (S/N)", width: 14, list: "SIM_NAO" },
  { key: "dataConsentimento", header: "Data do consentimento", width: 16, date: true },
] as const satisfies readonly { key: string; header: string; width: number; list?: ListKey; date?: true }[];

type ColumnKey = (typeof COLUMNS)[number]["key"];
type RawRow = Record<ColumnKey, string>;

const BONDS: [string, PersonBond][] = [
  ["Visitante", "VISITANTE"],
  ["Novo convertido", "NOVO_CONVERTIDO"],
  ["Congregado", "CONGREGADO"],
  ["Membro", "MEMBRO"],
  ["Membro em formação", "MEMBRO_EM_FORMACAO"],
];

export const BOND_LABELS = Object.fromEntries(BONDS.map(([label, bond]) => [bond, label])) as Record<
  PersonBond,
  string
>;

const SEXES: [string, Sex][] = [
  ["Masculino", "MASCULINO"],
  ["Feminino", "FEMININO"],
];

const MARITAL_STATUSES: [string, MaritalStatus][] = [
  ["Solteiro(a)", "SOLTEIRO"],
  ["Casado(a)", "CASADO"],
  ["União estável", "UNIAO_ESTAVEL"],
  ["Separado(a)", "SEPARADO"],
  ["Divorciado(a)", "DIVORCIADO"],
  ["Viúvo(a)", "VIUVO"],
];

const DOCUMENT_TYPES: [string, OtherDocumentType][] = [
  ["RG", "RG"],
  ["Passaporte", "PASSAPORTE"],
  ["Certidão de nascimento", "CERTIDAO_NASCIMENTO"],
  ["Outro", "OUTRO"],
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export interface AdmissionMethod {
  id: string;
  name: string;
}

export interface TemplateInfo {
  organizationId: string;
  organizationName: string;
  admissionMethods: AdmissionMethod[];
}

function listValues(key: ListKey, admissionMethods: AdmissionMethod[]) {
  switch (key) {
    case "VINCULO":
      return BONDS.map(([label]) => label);
    case "SEXO":
      return SEXES.map(([label]) => label);
    case "ESTADO_CIVIL":
      return MARITAL_STATUSES.map(([label]) => label);
    case "DOCUMENTO":
      return DOCUMENT_TYPES.map(([label]) => label);
    case "SIM_NAO":
      return ["S", "N"];
    case "UF":
      return UFS;
    case "FORMA_ADMISSAO":
      return admissionMethods.map((item) => item.name);
  }
}

function formatBr(civil: string) {
  const [year, month, day] = civil.split("-");
  return `${day}/${month}/${year}`;
}

const INSTRUCTIONS = (info: TemplateInfo) => [
  "Importação de pessoas — instruções",
  "",
  `Esta planilha é de ${info.organizationName}, gerada em ${formatBr(todayCivil())} (modelo ${TEMPLATE_VERSION}). Para outra congregação, baixe o modelo com ela selecionada no iEzer.`,
  "",
  "1. Preencha uma pessoa por linha na aba Pessoas. A linha 2 é um exemplo e é ignorada na importação (pode apagá-la).",
  "2. Colunas com * são obrigatórias. Não mude os nomes das colunas nem apague as abas.",
  "3. Datas no formato dd/mm/aaaa. CPF, telefones e CEP como texto, com ou sem pontuação. Celular e telefone com DDD.",
  "4. Vínculo, sexo, estado civil, tipo de documento, UF, forma de admissão e as colunas S/N: escolha o valor na lista da célula.",
  "5. Menores de 18 anos e Membro em formação precisam de um responsável maior de 18 anos: informe o CPF ou o nome completo dele, que pode estar cadastrado no iEzer ou em outra linha desta planilha. A criança entra na família do responsável.",
  "6. Para menores de 18 anos, o consentimento dado pelo responsável é obrigatório (Consentimento coletado = S). Linha de menor sem responsável ou sem consentimento é recusada.",
  "7. Marque Consentimento coletado = S só se a igreja tiver a ficha assinada. A guarda das fichas em papel com o termo assinado é responsabilidade da igreja.",
  "8. Quem já existe no iEzer (mesmo CPF, ou nome parecido com o mesmo nascimento, celular ou email) aparece na pré-visualização: você escolhe pular a linha ou atualizar o cadastro. Atualizar só preenche o que veio na planilha; vínculo, situação e congregação não mudam.",
  "9. Todos entram com situação Ativo. Vínculo sem os dados mínimos (ex.: Membro sem data de admissão) entra como cadastro incompleto.",
  `10. Até ${MAX_ROWS.toLocaleString("pt-BR")} pessoas por arquivo. Nada é gravado antes da confirmação.`,
  "11. Preencheu no Numbers ou no Google Planilhas? Exporte como Excel (.xlsx) antes de enviar. No Numbers: Arquivo › Exportar para › Excel. O iEzer não lê o arquivo .numbers.",
  "",
  `Código do modelo (não apague): ${TEMPLATE_VERSION} · ${info.organizationId}`,
];

// Formato texto (@) em todas as colunas: o Excel não converte data, CPF nem telefone (RF-I03).
export async function buildTemplate(info: TemplateInfo) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "iEzer";

  const instructions = workbook.addWorksheet("Instruções");
  instructions.getColumn(1).width = 120;
  INSTRUCTIONS(info).forEach((text, index) => {
    const cell = instructions.getCell(index + 1, 1);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (index === 0) cell.font = { bold: true, size: 14 };
  });

  const people = workbook.addWorksheet(PEOPLE_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  people.columns = COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
    style: { numFmt: "@" },
  }));
  const header = people.getRow(1);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: "middle" };
  header.height = 32;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  });

  const consentDate = formatBr(todayCivil());
  const example: Partial<RawRow> = {
    nome: EXAMPLE_NAME,
    apelido: "Maria",
    vinculo: "Membro",
    sexo: "Feminino",
    nascimento: "15/03/1985",
    estadoCivil: "Casado(a)",
    celular: "(11) 98765-4321",
    celularWhatsapp: "S",
    email: "maria.exemplo@email.com",
    cep: "01310-100",
    logradouro: "Avenida Paulista",
    numero: "1000",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
    batizado: "S",
    batismo: "10/05/2005",
    formaAdmissao: info.admissionMethods[0]?.name ?? "",
    admissao: "10/05/2005",
    consentimento: "S",
    dataConsentimento: consentDate,
  };
  const exampleRow = people.addRow(example);
  exampleRow.font = { italic: true, color: { argb: "FF6B7280" } };

  // Formato texto célula a célula: o da coluna basta no Excel do Windows, mas Numbers, Google
  // Planilhas e LibreOffice o ignoram e tiram o zero à esquerda do CPF e do CEP.
  for (let line = 3; line <= MAX_ROWS + 2; line++) {
    const row = people.getRow(line);
    for (let column = 1; column <= COLUMNS.length; column++) row.getCell(column).numFmt = "@";
  }

  // Listas numa aba oculta, usadas como validação (dropdown) nas colunas (RF-I01).
  const lists = workbook.addWorksheet(LISTS_SHEET, { state: "hidden" });
  const validations = (people as unknown as {
    dataValidations: { add(address: string, validation: ExcelJS.DataValidation): void };
  }).dataValidations;
  const listColumns = new Map<ListKey, string>();

  COLUMNS.forEach((column, index) => {
    const letter = people.getColumn(index + 1).letter;
    const range = `${letter}2:${letter}${MAX_ROWS + 2}`;

    if ("list" in column) {
      const values = listValues(column.list, info.admissionMethods);
      if (values.length === 0) return;

      let listLetter = listColumns.get(column.list);
      if (!listLetter) {
        const listColumn = lists.getColumn(listColumns.size + 1);
        listLetter = listColumn.letter;
        listColumns.set(column.list, listLetter);
        lists.getCell(1, listColumns.size).value = column.list;
        values.forEach((value, row) => (lists.getCell(row + 2, listColumns.size).value = value));
      }

      validations.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [`${LISTS_SHEET}!$${listLetter}$2:$${listLetter}$${values.length + 1}`],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: column.header.replace(" *", ""),
        error: "Escolha um valor da lista.",
      });
    } else if ("date" in column) {
      validations.add(range, {
        type: "textLength",
        operator: "lessThanOrEqual",
        allowBlank: true,
        formulae: [10],
        showInputMessage: true,
        prompt: "dd/mm/aaaa",
        showErrorMessage: true,
        errorStyle: "stop",
        error: "Use dd/mm/aaaa.",
      });
    }
  });

  // Versão do modelo e organização numa aba invisível (RF-I04).
  const meta = workbook.addWorksheet(META_SHEET, { state: "veryHidden" });
  meta.addRows([
    ["versao", TEMPLATE_VERSION],
    ["organizacao", info.organizationId],
    ["gerado_em", new Date().toISOString()],
  ]);

  workbook.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function invalidTemplate(message: string): never {
  throw new AppError(400, "TEMPLATE_INVALID", message);
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // O exceljs lê datas como meia-noite UTC.
    return formatBr(value.toISOString().slice(0, 10));
  }
  if (typeof value === "boolean") return value ? "S" : "N";
  if (typeof value === "number" || typeof value === "string") return String(value).trim();
  if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if ("formula" in value || "sharedFormula" in value) return cellText((value.result ?? null) as ExcelJS.CellValue);
  if ("hyperlink" in value) return cellText(value.text as ExcelJS.CellValue);
  return "";
}

const normalizeHeader = (value: string) => normalizeSearchText(value.replace("*", ""));

export interface SheetRow {
  line: number;
  values: RawRow;
}

export interface ParsedSheet {
  templateVersion: string;
  organizationId: string;
  rows: SheetRow[];
}

// Código do modelo também visível na aba Instruções: o Numbers e o Google Planilhas podem
// descartar as abas ocultas ao exportar para .xlsx.
const TEMPLATE_CODE = /c[oó]digo do modelo[^:]*:\s*(\S+)\s*·\s*(\S+)/i;

// .numbers também é um zip, com os dados em Index/*.iwa (formato próprio da Apple).
function isNumbersFile(buffer: Buffer) {
  return buffer.subarray(0, 2).toString() === "PK" && buffer.includes("Index/") && !buffer.includes("[Content_Types].xml");
}

function readTemplateCode(workbook: ExcelJS.Workbook) {
  const meta = workbook.getWorksheet(META_SHEET);
  if (meta) {
    const value = (key: string) => {
      for (let row = 1; row <= meta.rowCount; row++) {
        if (cellText(meta.getCell(row, 1).value) === key) return cellText(meta.getCell(row, 2).value);
      }
      return "";
    };
    if (value("versao")) return { version: value("versao"), organizationId: value("organizacao") };
  }

  for (const sheet of workbook.worksheets) {
    for (let row = 1; row <= Math.min(sheet.rowCount, 60); row++) {
      for (let column = 1; column <= 3; column++) {
        const match = TEMPLATE_CODE.exec(cellText(sheet.getCell(row, column).value));
        if (match) return { version: match[1], organizationId: match[2] };
      }
    }
  }
  return null;
}

// Linha de cabeçalho: na aba Pessoas ou, se o app de planilha renomeou as abas, na primeira que
// tiver "Nome completo" nas primeiras linhas.
function findHeader(workbook: ExcelJS.Workbook) {
  const target = normalizeHeader(COLUMNS[0].header);
  const preferred = workbook.getWorksheet(PEOPLE_SHEET);
  const sheets = preferred ? [preferred, ...workbook.worksheets.filter((sheet) => sheet !== preferred)] : workbook.worksheets;

  for (const sheet of sheets) {
    for (let line = 1; line <= Math.min(sheet.rowCount, 5); line++) {
      let found = false;
      sheet.getRow(line).eachCell((cell) => {
        if (normalizeHeader(cellText(cell.value)) === target) found = true;
      });
      if (found) return { sheet, headerLine: line };
    }
  }
  return null;
}

export async function readSheet(buffer: Buffer): Promise<ParsedSheet> {
  if (isNumbersFile(buffer)) {
    throw new AppError(
      400,
      "NUMBERS_FILE",
      "Este é um arquivo do Numbers. No Numbers, use Arquivo › Exportar para › Excel e envie o arquivo .xlsx.",
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    invalidTemplate("Não foi possível ler o arquivo. Envie a planilha .xlsx baixada do iEzer.");
  }

  const code = readTemplateCode(workbook);
  const header = findHeader(workbook);
  if (!header) invalidTemplate("Esta não é a planilha modelo do iEzer. Baixe o modelo e preencha nele.");
  // Cabeçalho certo, sem código: modelo antigo exportado pelo Numbers ou Google Planilhas,
  // que apagaram a aba oculta.
  if (!code) {
    invalidTemplate(
      "Não encontramos o código do modelo nesta planilha (o Numbers e o Google Planilhas apagam a aba oculta dos modelos antigos). Baixe o modelo de novo e copie os dados para ele.",
    );
  }

  if (code.version !== TEMPLATE_VERSION) {
    throw new AppError(
      400,
      "TEMPLATE_OUTDATED",
      "Esta planilha foi gerada num modelo antigo. Baixe o modelo atual e copie os dados para ele.",
      { templateVersion: code.version },
    );
  }

  const { sheet: people, headerLine } = header;
  const headerIndex = new Map<string, number>();
  people.getRow(headerLine).eachCell((cell, column) => headerIndex.set(normalizeHeader(cellText(cell.value)), column));

  const columnIndex = new Map<ColumnKey, number>();
  const missing: string[] = [];
  for (const column of COLUMNS) {
    const index = headerIndex.get(normalizeHeader(column.header));
    if (index) columnIndex.set(column.key, index);
    else missing.push(column.header.replace(" *", ""));
  }
  if (missing.length > 0) invalidTemplate(`Colunas não encontradas na aba Pessoas: ${missing.join(", ")}.`);

  const rows: SheetRow[] = [];
  const exampleName = normalizeSearchText(EXAMPLE_NAME);

  people.eachRow({ includeEmpty: false }, (row, line) => {
    if (line <= headerLine) return;
    const values = Object.fromEntries(
      COLUMNS.map((column) => [column.key, cellText(row.getCell(columnIndex.get(column.key)!).value)]),
    ) as RawRow;
    if (Object.values(values).every((value) => value === "")) return;
    if (normalizeSearchText(values.nome) === exampleName) return;
    rows.push({ line, values });
  });

  if (rows.length === 0) throw new AppError(400, "EMPTY_FILE", "A planilha não tem nenhuma pessoa preenchida.");
  if (rows.length > MAX_ROWS) {
    throw new AppError(
      400,
      "TOO_MANY_ROWS",
      `A planilha tem ${rows.length} pessoas; o limite é ${MAX_ROWS} por arquivo. Divida em mais de um arquivo.`,
    );
  }

  return { templateVersion: code.version, organizationId: code.organizationId, rows };
}

// Campos cadastrais aceitos na importação: só os preenchidos vêm no objeto.
export interface ImportFields {
  name?: string;
  preferredName?: string;
  sex?: Sex;
  birthDate?: Date;
  maritalStatus?: MaritalStatus;
  cpf?: string;
  otherDocumentType?: OtherDocumentType;
  otherDocumentNumber?: string;
  mobilePhone?: string;
  mobileIsWhatsapp?: boolean;
  secondaryPhone?: string;
  email?: string;
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  firstVisitDate?: Date;
  conversionDate?: Date;
  isBaptized?: boolean;
  baptismDate?: Date;
  baptismChurch?: string;
  professionOfFaithDate?: Date;
  admissionMethodId?: string;
  admissionDate?: Date;
  originChurch?: string;
  notes?: string;
}

export interface ParsedRow {
  line: number;
  name: string;
  bond: PersonBond | null;
  fields: ImportFields;
  guardian: { cpf: string | null; name: string | null };
  consent: { given: boolean; date: Date | null };
  errors: string[];
}

// Aceita o rótulo da lista, sem acento ou maiúsculas, e "Casada"/"Casado" para "Casado(a)".
function matchList<T>(value: string, entries: [string, T][]): T | undefined {
  const target = normalizeSearchText(value);
  for (const [label, result] of entries) {
    const normalized = normalizeSearchText(label);
    if (target === normalized) return result;
    if (!normalized.endsWith("(a)")) continue;
    const base = normalized.replace("(a)", "");
    if (target === base || target === `${base.slice(0, -1)}a`) return result;
  }
  return undefined;
}

const emailSchema = z.email();

// Excel guarda número sem os zeros à esquerda (CPF e CEP digitados sem formato texto).
function padDigits(value: string, length: number) {
  return /^\d+$/.test(value) && value.length < length && value.length >= length - 3 ? value.padStart(length, "0") : value;
}

export function parseRow(row: SheetRow, admissionMethods: AdmissionMethod[]): ParsedRow {
  const { values } = row;
  const errors: string[] = [];
  const fields: ImportFields = {};
  const today = todayCivil();

  const label = (key: ColumnKey) => COLUMNS.find((column) => column.key === key)!.header.replace(" *", "");
  const fail = (key: ColumnKey, message: string) => errors.push(`${label(key)}: ${message}`);

  const text = (key: ColumnKey, max: number) => {
    const value = values[key];
    if (!value) return undefined;
    if (value.length > max) {
      fail(key, `use no máximo ${max} caracteres.`);
      return undefined;
    }
    return value;
  };

  const date = (key: ColumnKey) => {
    const value = values[key];
    if (!value) return undefined;

    let civil: string | null = null;
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (br) civil = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) civil = value;
    else if (/^\d{4,5}(\.\d+)?$/.test(value)) {
      // Data guardada como número de série do Excel.
      civil = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86_400_000).toISOString().slice(0, 10);
    }

    if (!civil || !isCivilDate(civil)) {
      fail(key, `"${value}" não é uma data válida (use dd/mm/aaaa).`);
      return undefined;
    }
    if (civil > today) {
      fail(key, "a data não pode ser no futuro.");
      return undefined;
    }
    if (civil < "1900-01-01") {
      fail(key, "data antes de 1900.");
      return undefined;
    }
    return parseCivilDate(civil);
  };

  const list = <T>(key: ColumnKey, entries: [string, T][]) => {
    const value = values[key];
    if (!value) return undefined;
    const result = matchList(value, entries);
    if (result === undefined) fail(key, `"${value}" não está na lista.`);
    return result;
  };

  const yesNo = (key: ColumnKey) =>
    list(key, [
      ["S", true],
      ["Sim", true],
      ["N", false],
      ["Não", false],
    ]);

  const phone = (key: ColumnKey) => {
    const value = values[key];
    if (!value) return undefined;
    const normalized = normalizePhone(value);
    if (!normalized) fail(key, `"${value}" não é um telefone válido (informe DDD e número).`);
    return normalized ?? undefined;
  };

  const name = values.nome.replace(/\s+/g, " ").trim();
  if (name.length < 2) fail("nome", name ? "informe o nome (mínimo 2 letras)." : "obrigatório.");
  else if (name.length > 150) fail("nome", "use no máximo 150 caracteres.");
  else fields.name = name;

  const bond = values.vinculo ? (list("vinculo", BONDS) ?? null) : null;
  if (!values.vinculo) fail("vinculo", "obrigatório.");

  fields.preferredName = text("apelido", 80);
  fields.sex = list("sexo", SEXES);
  fields.birthDate = date("nascimento");
  fields.maritalStatus = list("estadoCivil", MARITAL_STATUSES);

  if (values.cpf) {
    const cpf = normalizeCpf(padDigits(values.cpf, 11));
    if (isValidCpf(cpf)) fields.cpf = cpf;
    else fail("cpf", `"${values.cpf}" não é um CPF válido.`);
  }

  fields.otherDocumentType = list("outroDocumentoTipo", DOCUMENT_TYPES);
  fields.otherDocumentNumber = text("outroDocumentoNumero", 40);
  if (fields.otherDocumentNumber && !fields.otherDocumentType) fail("outroDocumentoTipo", "informe o tipo do documento.");

  fields.mobilePhone = phone("celular");
  fields.mobileIsWhatsapp = yesNo("celularWhatsapp");
  fields.secondaryPhone = phone("telefone");

  if (values.email) {
    const email = values.email.toLowerCase();
    if (email.length <= 254 && emailSchema.safeParse(email).success) fields.email = email;
    else fail("email", `"${values.email}" não é um email válido.`);
  }

  if (values.cep) {
    const cep = padDigits(values.cep, 8).replace(/\D/g, "");
    if (cep.length === 8) fields.postalCode = cep;
    else fail("cep", `"${values.cep}" não é um CEP válido.`);
  }

  fields.street = text("logradouro", 200);
  fields.number = text("numero", 20);
  fields.complement = text("complemento", 100);
  fields.district = text("bairro", 100);
  fields.city = text("cidade", 100);
  fields.state = list(
    "uf",
    UFS.map((uf) => [uf, uf] as [string, string]),
  );

  fields.firstVisitDate = date("primeiraVisita");
  fields.conversionDate = date("conversao");
  const baptized = yesNo("batizado");
  fields.baptismDate = date("batismo");
  if (baptized === false && fields.baptismDate) fail("batizado", "marcado N, mas há data do batismo.");
  fields.isBaptized = baptized ?? (fields.baptismDate ? true : undefined);
  fields.baptismChurch = text("igrejaBatismo", 200);
  fields.professionOfFaithDate = date("profissaoFe");

  if (values.formaAdmissao) {
    const method = admissionMethods.find(
      (item) => normalizeSearchText(item.name) === normalizeSearchText(values.formaAdmissao),
    );
    if (method) fields.admissionMethodId = method.id;
    else fail("formaAdmissao", `"${values.formaAdmissao}" não está nas listas da igreja.`);
  }
  fields.admissionDate = date("admissao");
  fields.originChurch = text("igrejaOrigem", 200);
  fields.notes = text("observacoes", 2000);

  let guardianCpf: string | null = null;
  if (values.cpfResponsavel) {
    const cpf = normalizeCpf(padDigits(values.cpfResponsavel, 11));
    if (isValidCpf(cpf)) guardianCpf = cpf;
    else fail("cpfResponsavel", `"${values.cpfResponsavel}" não é um CPF válido.`);
  }
  const guardianName = values.nomeResponsavel.replace(/\s+/g, " ").trim() || null;

  const consentGiven = yesNo("consentimento") ?? false;
  const consentDate = date("dataConsentimento") ?? null;
  if (consentDate && !consentGiven) fail("consentimento", "há data do consentimento, mas a coluna não está marcada S.");

  for (const key of Object.keys(fields) as (keyof ImportFields)[]) {
    if (fields[key] === undefined) delete fields[key];
  }

  return {
    line: row.line,
    name,
    bond,
    fields,
    guardian: { cpf: guardianCpf, name: guardianName },
    consent: { given: consentGiven, date: consentDate },
    errors,
  };
}

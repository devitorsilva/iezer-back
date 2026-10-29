import { Prisma } from "@prisma/client";
import { runAudited, type AuditActor } from "../../../lib/audit.js";
import { addDays, formatCivilDate, parseCivilDate } from "../../../lib/civil-date.js";
import { churchErasureNotice } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { createId } from "../../../lib/ids.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { detectDocumentType, removeObject, uploadObject } from "../../../lib/storage.js";
import { availableExportWhere } from "./exportacao.js";
import { civilDateBr, describeDocument } from "./responsavel.js";
import type { RecordErasureInput } from "./schemas.js";
import { ChurchAdminNotFoundError } from "./service.js";

type Db = Prisma.TransactionClient;

// Eliminação definitiva (B6, RF-BO24, RF-BO60). Os dados saem fora da tela, pelo
// docs/roteiro-eliminacao.md; o back-office só registra quando foi feita, quem conferiu e o
// documento, depois de conferir que não sobrou nada, e a igreja passa a Encerrada.

// Documentos do contrato guardados por mais 5 anos depois do fim (RF-BO58).
const DOCUMENT_RETENTION_YEARS = 5;
// Retenção das cópias de segurança do banco, citada no comprovante. Conferir com o plano do Supabase
// de produção (docs/roteiro-eliminacao.md › Backups).
export const BACKUP_RETENTION_DAYS = 7;

const inChurch = (churchId: string) => ({ OR: [{ id: churchId }, { parentId: churchId }] });

// O que o roteiro apaga, contado por conjunto. O log fica só com as linhas da equipe e do sistema,
// sem antes/depois nem pessoas (passo do roteiro com a trava desligada).
export async function remainingChurchData(churchId: string, db: Db = prisma) {
  const orgIds = (await db.organization.findMany({ where: inChurch(churchId), select: { id: true } })).map((org) => org.id);
  const inOrgs = { organizationId: { in: orgIds } };

  const counts = await Promise.all([
    db.person.count({ where: inOrgs }),
    db.family.count({ where: inOrgs }),
    db.personRelation.count({ where: inOrgs }),
    db.personEvent.count({ where: inOrgs }),
    db.followUp.count({ where: inOrgs }),
    db.personConsent.count({ where: inOrgs }),
    db.receivable.count({ where: inOrgs }),
    db.payable.count({ where: inOrgs }),
    db.category.count({ where: inOrgs }),
    db.costCenter.count({ where: inOrgs }),
    db.bankAccount.count({ where: inOrgs }),
    db.supplier.count({ where: inOrgs }),
    db.churchListItem.count({ where: inOrgs }),
    db.user.count({
      where: {
        teamMember: null,
        OR: [{ assignments: { some: inOrgs } }, { person: inOrgs }],
      },
    }),
    db.invite.count({ where: { churchId } }),
    db.accessProfile.count({ where: inOrgs }),
    db.emailEvent.count({ where: inOrgs }),
    db.auditLog.count({
      where: {
        ...inOrgs,
        OR: [
          { actorType: "USUARIO" },
          { NOT: { before: { equals: Prisma.AnyNull } } },
          { NOT: { after: { equals: Prisma.AnyNull } } },
          { NOT: { personIds: { isEmpty: true } } },
        ],
      },
    }),
  ]);

  const labels = [
    "Pessoas",
    "Famílias",
    "Parentescos",
    "Eventos do ciclo de vida",
    "Acompanhamentos",
    "Consentimentos",
    "Contas a receber",
    "Contas a pagar",
    "Categorias",
    "Centros de custo",
    "Contas bancárias",
    "Fornecedores",
    "Itens das listas da igreja",
    "Usuários",
    "Convites",
    "Perfis de acesso",
    "Eventos de e-mail",
    "Linhas da Auditoria com dados",
  ];

  return labels.map((label, index) => ({ label, count: counts[index]! })).filter((item) => item.count > 0);
}

const erasureInclude = {
  document: true,
  recordedBy: { select: { name: true } },
} satisfies Prisma.ChurchErasureInclude;

type ErasureRow = Prisma.ChurchErasureGetPayload<{ include: typeof erasureInclude }>;

function mapErasure(erasure: ErasureRow) {
  const { document } = erasure;
  return {
    id: erasure.id,
    erasedAt: formatCivilDate(erasure.erasedAt),
    checkedByName: erasure.checkedByName,
    notes: erasure.notes,
    recordedByName: erasure.recordedBy?.name ?? null,
    createdAt: erasure.createdAt.toISOString(),
    document: {
      id: document.id,
      type: document.type,
      date: formatCivilDate(document.documentDate),
      minutesNumber: document.minutesNumber,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      discardAt: document.discardAt?.toISOString() ?? null,
    },
  };
}

// Aba da situação: o registro, quando há; senão, o que ainda falta apagar (só com a igreja suspensa).
export async function getChurchErasure(churchId: string) {
  const church = await prisma.organization.findFirst({
    where: { id: churchId, type: "SEDE", parentId: null },
    select: { status: true, erasure: { include: erasureInclude } },
  });
  if (!church) throw new ChurchAdminNotFoundError("church");

  const [remaining, availableExport] =
    !church.erasure && church.status === "SUSPENSA"
      ? await Promise.all([remainingChurchData(churchId), prisma.churchExport.count({ where: availableExportWhere(churchId) })])
      : [[], 0];

  return {
    erasure: church.erasure ? mapErasure(church.erasure) : null,
    remaining,
    hasAvailableExport: availableExport > 0,
  };
}

// Registro da eliminação (RF-BO24): só de igreja suspensa, sem dados restantes e sem exportação
// ainda à espera do download. O documento vai ao Storage antes da transação (como na troca do
// responsável) e sai se a gravação falhar. Depois do commit, o comprovante ao responsável pela conta.
export async function recordChurchErasure(actor: AuditActor, churchId: string, input: RecordErasureInput) {
  const detected = detectDocumentType(input.file.content);
  if (!detected) {
    throw new AppError(400, "INVALID_FILE_TYPE", "Envie o documento em PDF, JPG ou PNG.", { field: "file" });
  }

  const church = await prisma.organization.findFirst({
    where: { id: churchId, type: "SEDE", parentId: null },
    select: {
      id: true,
      name: true,
      status: true,
      erasure: { select: { id: true } },
      contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } },
    },
  });
  if (!church) throw new ChurchAdminNotFoundError("church");
  if (church.erasure) {
    throw new AppError(409, "CHURCH_ALREADY_ERASED", "A eliminação desta igreja já foi registrada.");
  }
  if (church.status !== "SUSPENSA") {
    throw new AppError(409, "CHURCH_STATUS_INVALID", "Só uma igreja suspensa pode ter a eliminação registrada.", {
      status: church.status,
    });
  }

  const [remaining, pendingExports] = await Promise.all([
    remainingChurchData(church.id),
    prisma.churchExport.count({
      where: { OR: [{ organizationId: church.id, status: "PROCESSANDO" }, availableExportWhere(church.id)] },
    }),
  ]);
  if (pendingExports > 0) {
    throw new AppError(
      409,
      "EXPORT_STILL_AVAILABLE",
      "Há uma exportação em andamento ou à espera do download. Espere o responsável baixar ou o link vencer.",
    );
  }
  if (remaining.length > 0) {
    throw new AppError(409, "CHURCH_DATA_REMAINING", "Ainda há dados da igreja no banco. Siga o roteiro de eliminação antes de registrar.", {
      remaining,
    });
  }

  const documentId = createId();
  const storagePath = `${church.id}/documentos/${documentId}.${detected.extension}`;
  await uploadObject(storagePath, input.file.content, detected.mimeType);

  const erasedAt = parseCivilDate(input.erasedAt);
  const documentDate = parseCivilDate(input.document.date);
  const documentLabel = describeDocument({
    type: input.document.type,
    documentDate,
    minutesNumber: input.document.minutesNumber ?? null,
  });
  const discardAt = new Date(erasedAt);
  discardAt.setUTCFullYear(discardAt.getUTCFullYear() + DOCUMENT_RETENTION_YEARS);

  let erasure: ErasureRow;
  try {
    erasure = await runAudited(actor, async (tx, audit) => {
      await tx.accountDocument.create({
        data: {
          id: documentId,
          organizationId: church.id,
          type: input.document.type,
          documentDate,
          minutesNumber: input.document.minutesNumber ?? null,
          storagePath,
          fileName: input.file.name,
          mimeType: detected.mimeType,
          sizeBytes: input.file.content.length,
          createdById: actor.userId,
        },
      });

      const created = await tx.churchErasure.create({
        data: {
          organizationId: church.id,
          erasedAt,
          checkedByName: input.checkedByName,
          documentId,
          notes: input.notes ?? null,
          recordedById: actor.userId,
        },
      });

      const statusReason = "Eliminação definitiva registrada";
      const { count } = await tx.organization.updateMany({
        where: { id: church.id, status: "SUSPENSA" },
        data: { status: "ENCERRADA", statusChangedAt: new Date(), statusReason },
      });
      if (count === 0) {
        throw new AppError(409, "CHURCH_STATUS_INVALID", "A situação da igreja mudou agora há pouco. Recarregue a página.");
      }

      // Fim do contrato: começa a contar o descarte dos documentos (RF-BO58). Relido depois, com a data.
      await tx.accountDocument.updateMany({ where: { organizationId: church.id }, data: { discardAt } });

      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "registrar_eliminacao",
        targetType: "ChurchErasure",
        targetId: created.id,
        description: `Documento: ${documentLabel} (${input.file.name})`,
        after: {
          erasedAt: input.erasedAt,
          checkedByName: input.checkedByName,
          notes: input.notes ?? null,
          status: "ENCERRADA",
          statusReason,
        },
        personIds: [],
      });

      return tx.churchErasure.findUniqueOrThrow({ where: { id: created.id }, include: erasureInclude });
    });
  } catch (error) {
    await removeObject(storagePath);
    throw error;
  }

  const owner = church.contacts[0];
  const emailSent = owner
    ? await trySendMail(
        churchErasureNotice({
          to: owner.email,
          name: owner.name,
          churchName: church.name,
          erasedAt: civilDateBr(erasedAt),
          document: documentLabel,
          backupRetentionDays: BACKUP_RETENTION_DAYS,
        }),
      )
    : false;

  return { ...mapErasure(erasure), emailSent, backupsExpireOn: formatCivilDate(addDays(erasedAt, BACKUP_RETENTION_DAYS)) };
}

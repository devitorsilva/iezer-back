import type { AccountDocumentType, Prisma } from "@prisma/client";
import { recordAudit, runAudited, type AuditActor } from "../../../lib/audit.js";
import { formatCivilDate, parseCivilDate } from "../../../lib/civil-date.js";
import { accountOwnerChangedNotice } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { createId } from "../../../lib/ids.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { createSignedUrl, detectDocumentType, removeObject, uploadObject } from "../../../lib/storage.js";
import { assertNotTeamContactEmail } from "../../../lib/team.js";
import { normalizeSearchText } from "../../../lib/text.js";
import type { ChangeAccountOwnerInput } from "./schemas.js";
import { ChurchAdminNotFoundError } from "./service.js";
import { findActiveAdmins } from "./situacao.js";

const DOCUMENT_TYPE_LABELS: Record<AccountDocumentType, string> = {
  ATA: "Ata",
  PROCURACAO: "Procuração",
  OUTRO: "Outro documento",
};

const changeInclude = {
  document: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.AccountOwnerChangeInclude;

type OwnerChangeRow = Prisma.AccountOwnerChangeGetPayload<{ include: typeof changeInclude }>;

export const civilDateBr = (date: Date) => formatCivilDate(date).split("-").reverse().join("/");

// "Ata nº 12 de 10/10/2026", para o log e os e-mails.
export function describeDocument(document: { type: AccountDocumentType; documentDate: Date; minutesNumber: string | null }) {
  return [
    DOCUMENT_TYPE_LABELS[document.type],
    document.minutesNumber ? `nº ${document.minutesNumber}` : null,
    `de ${civilDateBr(document.documentDate)}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function mapChange(change: OwnerChangeRow) {
  const { document } = change;
  return {
    id: change.id,
    createdAt: change.createdAt.toISOString(),
    createdByName: change.createdBy?.name ?? null,
    previousOwner: {
      name: change.previousName,
      jobTitle: change.previousJobTitle,
      email: change.previousEmail,
      phone: change.previousPhone,
    },
    newOwner: { name: change.newName, jobTitle: change.newJobTitle, email: change.newEmail, phone: change.newPhone },
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

const sameOwner = (a: { name: string; email: string }, b: { name: string; email: string }) =>
  a.email.toLowerCase() === b.email.toLowerCase() && normalizeSearchText(a.name) === normalizeSearchText(b.name);

// Troca do responsável pela conta (B7, RF-BO25, RF-BO26). O anexo vai ao Storage antes da transação
// (o upload não cabe numa transação do banco); se a gravação falhar, o arquivo é removido. Depois do
// commit, e-mail ao anterior, ao novo e aos admins da igreja.
export async function changeAccountOwner(actor: AuditActor, churchId: string, input: ChangeAccountOwnerInput) {
  const detected = detectDocumentType(input.file.content);
  if (!detected) {
    throw new AppError(400, "INVALID_FILE_TYPE", "Envie o documento em PDF, JPG ou PNG.", { field: "file" });
  }

  const church = await prisma.organization.findFirst({
    where: { id: churchId, type: "SEDE", parentId: null },
    select: { id: true, name: true, contacts: { where: { role: "RESPONSAVEL_CONTA" } } },
  });
  if (!church) throw new ChurchAdminNotFoundError("church");

  const current = church.contacts[0];
  if (!current) {
    throw new AppError(409, "ACCOUNT_OWNER_MISSING", "A igreja não tem responsável pela conta cadastrado.");
  }
  if (sameOwner(current, input.newOwner)) {
    throw new AppError(400, "SAME_ACCOUNT_OWNER", "O novo responsável é o mesmo de hoje. Para mudar só cargo, e-mail ou telefone, edite o contato.");
  }
  // Antes do upload: e-mail da equipe iEzer não vira responsável pela conta.
  await assertNotTeamContactEmail(input.newOwner.email, "newOwner.email");

  const documentId = createId();
  const storagePath = `${church.id}/documentos/${documentId}.${detected.extension}`;
  await uploadObject(storagePath, input.file.content, detected.mimeType);

  const { newOwner } = input;
  const documentDate = parseCivilDate(input.document.date);
  const documentLabel = describeDocument({
    type: input.document.type,
    documentDate,
    minutesNumber: input.document.minutesNumber ?? null,
  });

  let saved: { change: OwnerChangeRow; admins: { name: string; email: string }[] };
  try {
    saved = await runAudited(actor, async (tx, audit) => {
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

      const change = await tx.accountOwnerChange.create({
        data: {
          organizationId: church.id,
          documentId,
          previousName: current.name,
          previousJobTitle: current.jobTitle,
          previousEmail: current.email,
          previousPhone: current.phone,
          newName: newOwner.name,
          newJobTitle: newOwner.jobTitle ?? null,
          newEmail: newOwner.email,
          newPhone: newOwner.phone,
          createdById: actor.userId,
        },
        include: changeInclude,
      });

      const contact = await tx.organizationContact.update({
        where: { organizationId_role: { organizationId: church.id, role: "RESPONSAVEL_CONTA" } },
        data: { name: newOwner.name, jobTitle: newOwner.jobTitle ?? null, email: newOwner.email, phone: newOwner.phone },
      });

      const snapshot = (owner: { name: string; jobTitle: string | null; email: string; phone: string | null }) => ({
        name: owner.name,
        jobTitle: owner.jobTitle,
        email: owner.email,
        phone: owner.phone,
      });

      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "trocar_responsavel_conta",
        targetType: "OrganizationContact",
        targetId: contact.id,
        description: `Documento: ${documentLabel} (${input.file.name})`,
        before: snapshot(current),
        after: snapshot(contact),
      });

      return { change, admins: await findActiveAdmins(church.id, tx) };
    });
  } catch (error) {
    await removeObject(storagePath);
    throw error;
  }

  const recipients = new Map<string, { name: string; recipient: "ANTERIOR" | "NOVO" | "ADMIN" }>();
  recipients.set(current.email.toLowerCase(), { name: current.name, recipient: "ANTERIOR" });
  recipients.set(newOwner.email.toLowerCase(), { name: newOwner.name, recipient: "NOVO" });
  for (const admin of saved.admins) {
    const email = admin.email.toLowerCase();
    if (!recipients.has(email)) recipients.set(email, { name: admin.name, recipient: "ADMIN" });
  }

  const sent = await Promise.all(
    [...recipients].map(([to, { name, recipient }]) =>
      trySendMail(
        accountOwnerChangedNotice({
          to,
          name,
          churchName: church.name,
          recipient,
          previousName: current.name,
          newName: newOwner.name,
          document: documentLabel,
        }),
      ),
    ),
  );

  return { ...mapChange(saved.change), emailsSent: sent.filter(Boolean).length };
}

// Histórico de responsáveis (RF-BO27), da troca mais recente para a mais antiga.
export async function listAccountOwnerChanges(churchId: string) {
  const changes = await prisma.accountOwnerChange.findMany({
    where: { organizationId: churchId },
    orderBy: { createdAt: "desc" },
    include: changeInclude,
  });
  return changes.map(mapChange);
}

// Link assinado de 5 minutos para o anexo (RF-BO27, RF-BO57); cada abertura fica no log da igreja.
export async function openAccountDocument(actor: AuditActor, churchId: string, documentId: string) {
  const document = await prisma.accountDocument.findFirst({
    where: { id: documentId, organizationId: churchId },
    select: { id: true, storagePath: true, fileName: true, type: true, documentDate: true, minutesNumber: true },
  });
  if (!document) throw new ChurchAdminNotFoundError("document");

  const link = await createSignedUrl(document.storagePath);
  await recordAudit(actor, {
    organizationId: churchId,
    module: "CONFIGURACOES",
    action: "abrir_documento_conta",
    targetType: "AccountDocument",
    targetId: document.id,
    description: `${describeDocument(document)} (${document.fileName})`,
    personIds: [],
  });

  return { ...link, fileName: document.fileName };
}

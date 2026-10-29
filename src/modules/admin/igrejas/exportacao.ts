import type { ChurchExport, Prisma } from "@prisma/client";
import { recordAudit, runAudited, SYSTEM_ACTOR, type AuditActor } from "../../../lib/audit.js";
import { formatCivilDate } from "../../../lib/civil-date.js";
import { churchExportReadyEmail } from "../../../lib/emails.js";
import { AppError } from "../../../lib/errors.js";
import { trySendMail } from "../../../lib/mailer.js";
import { prisma } from "../../../lib/prisma.js";
import { assertStorageAvailable, createSignedUrl, removeObject, uploadObject } from "../../../lib/storage.js";
import { generateToken, hashToken } from "../../../lib/tokens.js";
import { formatDateTime } from "../../acesso/auditoria/rotulos.js";
import { buildChurchExport } from "./exportacao-planilhas.js";
import { ChurchAdminNotFoundError } from "./service.js";

// Exportação de fim de contrato (B14, RF-BO22, RF-BO23, RF-BO59, RT-BB07). Só o Administrador iEzer
// pede, só com a igreja suspensa. A geração roda no próprio processo, depois da resposta; o .zip vai
// ao Storage e o link de uso único (7 dias) vai só ao responsável pela conta. A equipe vê o andamento,
// nunca o token nem o arquivo.

export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Pedido em PROCESSANDO há mais que isso: o servidor caiu no meio (Render reinicia) e ele vira FALHOU.
const STALE_PROCESSING_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export type ChurchExportState = "PROCESSANDO" | "DISPONIVEL" | "BAIXADA" | "VENCIDA" | "FALHOU" | "SUBSTITUIDA";

type ExportRow = ChurchExport & { requestedBy: { name: string } | null };

export function exportState(item: Pick<ChurchExport, "status" | "downloadedAt" | "expiresAt" | "deletedAt">, now = new Date()): ChurchExportState {
  if (item.status !== "PRONTA") return item.status;
  if (item.downloadedAt) return "BAIXADA";
  if (item.deletedAt || !item.expiresAt || item.expiresAt <= now) return "VENCIDA";
  return "DISPONIVEL";
}

function mapExport(item: ExportRow) {
  return {
    id: item.id,
    state: exportState(item),
    requestedAt: item.requestedAt.toISOString(),
    requestedByName: item.requestedBy?.name ?? null,
    readyAt: item.readyAt?.toISOString() ?? null,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    downloadedAt: item.downloadedAt?.toISOString() ?? null,
    deletedAt: item.deletedAt?.toISOString() ?? null,
    recipientName: item.recipientName,
    recipientEmail: item.recipientEmail,
    sizeBytes: item.sizeBytes,
    datasets: (item.datasets as Record<string, number> | null) ?? null,
  };
}

export async function listChurchExports(churchId: string) {
  const items = await prisma.churchExport.findMany({
    where: { organizationId: churchId },
    include: { requestedBy: { select: { name: true } } },
    orderBy: { requestedAt: "desc" },
  });
  return items.map(mapExport);
}

// Exportações de uma igreja que ainda podem ser baixadas (pronta, sem download, no prazo).
export const availableExportWhere = (churchId: string, now = new Date()) =>
  ({
    organizationId: churchId,
    status: "PRONTA",
    downloadedAt: null,
    deletedAt: null,
    expiresAt: { gt: now },
  }) satisfies Prisma.ChurchExportWhereInput;

// RF-BO23: com uma em andamento ou já baixada, não gera outra. Uma pronta e não baixada (no prazo ou
// vencida) é substituída: o link antigo para de valer e o arquivo sai do Storage.
export async function requestChurchExport(actor: AuditActor, churchId: string) {
  assertStorageAvailable();

  const { created, replaced } = await runAudited(actor, async (tx, audit) => {
    const church = await tx.organization.findFirst({
      where: { id: churchId, type: "SEDE", parentId: null },
      select: { id: true, status: true, contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { id: true } } },
    });
    if (!church) throw new ChurchAdminNotFoundError("church");
    if (church.status !== "SUSPENSA") {
      throw new AppError(409, "CHURCH_STATUS_INVALID", "A exportação de fim de contrato só vale para igreja suspensa.", {
        status: church.status,
      });
    }
    if (church.contacts.length === 0) {
      throw new AppError(409, "ACCOUNT_OWNER_MISSING", "A igreja não tem responsável pela conta cadastrado para receber o link.");
    }

    // Dois pedidos ao mesmo tempo: o segundo espera o primeiro e vê a exportação em andamento.
    await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${church.id} FOR UPDATE`;

    const previous = await tx.churchExport.findMany({
      where: { organizationId: church.id, status: { in: ["PROCESSANDO", "PRONTA"] } },
      select: { id: true, status: true, downloadedAt: true, deletedAt: true, storagePath: true },
    });
    if (previous.some((item) => item.status === "PROCESSANDO")) {
      throw new AppError(409, "EXPORT_IN_PROGRESS", "Já há uma exportação sendo gerada para esta igreja.");
    }
    const downloaded = previous.find((item) => item.downloadedAt);
    if (downloaded) {
      throw new AppError(
        409,
        "EXPORT_ALREADY_DOWNLOADED",
        `O responsável já baixou a exportação em ${formatDateTime(downloaded.downloadedAt!)}.`,
      );
    }

    // Vencida e já apagada fica como está; só a que ainda tem arquivo vira substituída.
    const replaced = previous.filter((item) => item.status === "PRONTA" && !item.deletedAt);
    if (replaced.length > 0) {
      await tx.churchExport.updateMany({
        where: { id: { in: replaced.map((item) => item.id) } },
        data: { status: "SUBSTITUIDA" },
      });
    }

    const created = await tx.churchExport.create({
      data: { organizationId: church.id, requestedById: actor.userId },
      include: { requestedBy: { select: { name: true } } },
    });

    await audit({
      organizationId: church.id,
      module: "CONFIGURACOES",
      action: "gerar_exportacao",
      targetType: "ChurchExport",
      targetId: created.id,
      after: replaced.length > 0 ? { replacedExportIds: replaced.map((item) => item.id) } : undefined,
      personIds: [],
    });

    return { created, replaced: replaced.filter((item) => item.storagePath) };
  });

  for (const item of replaced) {
    if (await removeObject(item.storagePath!)) {
      await prisma.churchExport.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    }
  }

  setImmediate(() => void generateChurchExport(created.id));
  return mapExport(created);
}

// Gera, sobe e avisa. Erro em qualquer passo: FALHOU, arquivo removido e registro no log da igreja.
async function generateChurchExport(exportId: string) {
  const item = await prisma.churchExport.findUnique({
    where: { id: exportId },
    include: {
      organization: {
        select: { id: true, name: true, contacts: { where: { role: "RESPONSAVEL_CONTA" }, select: { name: true, email: true } } },
      },
    },
  });
  if (!item || item.status !== "PROCESSANDO") return;

  const church = item.organization;
  const storagePath = `${church.id}/exportacoes/${item.id}.zip`;
  let uploaded = false;

  try {
    const owner = church.contacts[0];
    if (!owner) throw new Error("igreja sem responsável pela conta");

    const now = new Date();
    const file = await buildChurchExport(church.id, church.name, now);
    await uploadObject(storagePath, file.buffer, "application/zip");
    uploaded = true;

    const { token, tokenHash } = generateToken();
    const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS);
    const { count } = await prisma.churchExport.updateMany({
      where: { id: item.id, status: "PROCESSANDO" },
      data: {
        status: "PRONTA",
        storagePath,
        sizeBytes: file.buffer.length,
        datasets: file.datasets,
        tokenHash,
        readyAt: now,
        expiresAt,
        recipientName: owner.name,
        recipientEmail: owner.email,
      },
    });
    // A limpeza marcou como FALHOU enquanto gerava: o arquivo não vale.
    if (count === 0) {
      await removeObject(storagePath);
      return;
    }

    const emailSent = await trySendMail(
      churchExportReadyEmail({ to: owner.email, name: owner.name, churchName: church.name, token, expiresAt }),
    );
    await recordAudit(SYSTEM_ACTOR, {
      organizationId: church.id,
      module: "CONFIGURACOES",
      action: "exportacao_pronta",
      targetType: "ChurchExport",
      targetId: item.id,
      after: { recipientEmail: owner.email, sizeBytes: file.buffer.length, emailSent },
      personIds: [],
    });
  } catch (error) {
    console.error(`[exportacao] ${item.id} falhou:`, error);
    if (uploaded) await removeObject(storagePath);
    await prisma.churchExport.updateMany({ where: { id: item.id, status: "PROCESSANDO" }, data: { status: "FALHOU" } });
    await recordAudit(SYSTEM_ACTOR, {
      organizationId: church.id,
      module: "CONFIGURACOES",
      action: "exportacao_falhou",
      targetType: "ChurchExport",
      targetId: item.id,
      personIds: [],
    }).catch((auditError) => console.error("[exportacao] log da falha não gravou:", auditError));
  }
}

const EXPORT_NOT_FOUND = () => new AppError(404, "EXPORT_NOT_FOUND", "Link inválido. Confira se copiou o endereço inteiro do e-mail.");

async function findByToken(token: string) {
  const item = await prisma.churchExport.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!item) throw EXPORT_NOT_FOUND();
  return item;
}

// Página pública do link (RF-BO23): igreja, prazo e se ainda dá para baixar. Não consome o token
// (leitores de e-mail abrem links sozinhos). O hash fica depois do prazo, para a página dizer que
// o link venceu em vez de "inválido".
export async function peekChurchExport(token: string) {
  const item = await findByToken(token);
  const state = exportState(item);
  return {
    churchName: item.organization.name,
    state: state === "PROCESSANDO" || state === "FALHOU" ? "VENCIDA" : state,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    downloadedAt: item.downloadedAt?.toISOString() ?? null,
    sizeBytes: item.sizeBytes,
  };
}

// Download (RF-BO23, RF-BO59): consome o token e devolve um link assinado de 5 minutos. O link é
// assinado antes de consumir, para uma falha do Storage não gastar o uso único. Fica na Auditoria
// da igreja com IP e navegador de quem baixou.
export async function downloadChurchExport(token: string, client: { ip: string | null; userAgent: string | null }) {
  const item = await findByToken(token);
  const state = exportState(item);
  if (state === "BAIXADA") {
    throw new AppError(410, "EXPORT_ALREADY_DOWNLOADED", "Este link já foi usado. Fale com o iEzer se precisar de outra cópia.");
  }
  if (state === "SUBSTITUIDA") {
    throw new AppError(410, "EXPORT_REPLACED", "Este link foi substituído por um mais novo. Use o último e-mail recebido.");
  }
  if (state !== "DISPONIVEL" || !item.storagePath) {
    throw new AppError(410, "EXPORT_EXPIRED", "O prazo deste link acabou e o arquivo foi apagado. Fale com o iEzer.");
  }

  const fileName = `iezer-${item.organization.slug}-${formatCivilDate(item.readyAt ?? item.requestedAt)}.zip`;
  const link = await createSignedUrl(item.storagePath, { download: fileName });

  const now = new Date();
  const { count } = await prisma.churchExport.updateMany({
    where: { id: item.id, status: "PRONTA", downloadedAt: null, deletedAt: null, expiresAt: { gt: now } },
    data: { downloadedAt: now, downloadIp: client.ip, downloadUserAgent: client.userAgent },
  });
  if (count === 0) {
    throw new AppError(410, "EXPORT_ALREADY_DOWNLOADED", "Este link já foi usado. Fale com o iEzer se precisar de outra cópia.");
  }

  await recordAudit(
    { type: "SISTEMA", userId: null, ip: client.ip, userAgent: client.userAgent },
    {
      organizationId: item.organization.id,
      module: "CONFIGURACOES",
      action: "baixar_exportacao",
      targetType: "ChurchExport",
      targetId: item.id,
      description: item.recipientEmail ? `Baixada pelo link enviado a ${item.recipientEmail}` : undefined,
      personIds: [],
    },
  );

  return { ...link, fileName };
}

let cleaning = false;

// Rotina de limpeza (RT-BB07, RT-BB14): apaga do Storage os arquivos vencidos (baixados ou não) e
// marca como FALHOU o que ficou preso em PROCESSANDO. Roda ao subir o servidor e a cada hora; com o
// Render gratuito dormindo, roda no próximo uso.
export async function cleanupChurchExports() {
  if (cleaning) return;
  cleaning = true;

  try {
    const now = new Date();
    await prisma.churchExport.updateMany({
      where: { status: "PROCESSANDO", requestedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
      data: { status: "FALHOU" },
    });

    const expired = await prisma.churchExport.findMany({
      where: { status: "PRONTA", deletedAt: null, expiresAt: { lte: now } },
      select: { id: true, organizationId: true, storagePath: true, downloadedAt: true },
    });

    for (const item of expired) {
      if (item.storagePath && !(await removeObject(item.storagePath))) continue;
      await prisma.churchExport.update({ where: { id: item.id }, data: { deletedAt: now } });
      await recordAudit(SYSTEM_ACTOR, {
        organizationId: item.organizationId,
        module: "CONFIGURACOES",
        action: "apagar_exportacao",
        targetType: "ChurchExport",
        targetId: item.id,
        description: item.downloadedAt ? "Arquivo apagado no fim do prazo (já baixado)." : "Arquivo apagado no fim do prazo, sem download.",
        personIds: [],
      });
    }
  } catch (error) {
    console.error("[exportacao] falha na limpeza:", error);
  } finally {
    cleaning = false;
  }
}

export function startChurchExportCleanup() {
  void cleanupChurchExports();
  const timer = setInterval(() => void cleanupChurchExports(), CLEANUP_INTERVAL_MS);
  timer.unref();
}

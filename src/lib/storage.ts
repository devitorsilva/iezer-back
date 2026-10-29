import { env } from "../config/env.js";
import { AppError } from "./errors.js";

// Arquivos da conta no Supabase Storage (RT-BB06, RF-BO57): bucket privado, acessado só pelo back
// com a chave service_role, pela API REST (https://supabase.com/docs/reference/api/storage).
// O navegador nunca recebe a chave nem o caminho; só links assinados curtos.

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

export interface DetectedFile {
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  extension: "pdf" | "png" | "jpg";
}

const startsWith = (buffer: Buffer, bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);

// Tipo pelo conteúdo, não pela extensão nem pelo MIME que o navegador informa.
export function detectDocumentType(buffer: Buffer): DetectedFile | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mimeType: "application/pdf", extension: "pdf" };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mimeType: "image/png", extension: "png" };
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
  return null;
}

// Confere a chave antes de aceitar um pedido que só sobe o arquivo depois (exportação).
export function assertStorageAvailable() {
  storageKey();
}

function storageKey() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "O envio de arquivos não está configurado no servidor. Fale com o Administrador iEzer.",
    );
  }
  return env.SUPABASE_SERVICE_ROLE_KEY;
}

const objectUrl = (path: string) =>
  `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;

function headers(key: string, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

async function failure(response: Response, action: string): Promise<never> {
  const detail = await response.text().catch(() => "");
  console.error(`[storage] ${action} falhou: ${response.status} ${detail}`);
  throw new AppError(502, "STORAGE_ERROR", "Não foi possível acessar o arquivo agora. Tente de novo em instantes.");
}

export async function uploadObject(path: string, body: Buffer, mimeType: string) {
  const key = storageKey();
  const response = await fetch(objectUrl(path), {
    method: "POST",
    // Sem cache (o padrão do Storage é 1 hora): arquivo apagado não pode continuar saindo por um
    // link assinado antes.
    headers: headers(key, { "Content-Type": mimeType, "x-upsert": "false", "cache-control": "max-age=0" }),
    body: new Uint8Array(body),
  });
  if (!response.ok) await failure(response, "upload");
}

// Remoção de melhor esforço (arquivo de uma gravação desfeita): só registra a falha. Diz se o
// arquivo saiu (ou já não existia), para a rotina de limpeza tentar de novo depois.
export async function removeObject(path: string) {
  try {
    const response = await fetch(objectUrl(path), { method: "DELETE", headers: headers(storageKey()) });
    if (response.ok) return true;
    // Arquivo que já não existe (apagado à mão, pelo roteiro) vem como 400 com NoSuchKey no corpo.
    const detail = await response.text().catch(() => "");
    if (response.status === 404 || detail.includes("NoSuchKey")) return true;
    console.error(`[storage] remoção de ${path} falhou: ${response.status} ${detail}`);
  } catch (error) {
    console.error(`[storage] remoção de ${path} falhou`, error);
  }
  return false;
}

// Link assinado de 5 minutos (RF-BO27, RF-BO57). Com `download`, o navegador salva com esse nome.
export async function createSignedUrl(path: string, options: { download?: string } = {}) {
  const key = storageKey();
  const signPath = objectUrl(path).replace("/storage/v1/object/", "/storage/v1/object/sign/");
  const response = await fetch(signPath, {
    method: "POST",
    headers: headers(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
  });
  if (!response.ok) await failure(response, "link assinado");

  const { signedURL } = (await response.json()) as { signedURL: string };
  const download = options.download ? `&download=${encodeURIComponent(options.download)}` : "";
  return {
    url: `${env.SUPABASE_URL}/storage/v1${signedURL}${download}`,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

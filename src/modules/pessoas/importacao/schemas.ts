import { z } from "zod";

// Tamanho máximo do .xlsx enviado (em base64 no JSON).
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_BODY_LIMIT = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 64 * 1024;

const arquivo = z
  .string("Envie o arquivo da planilha.")
  .min(1, "Envie o arquivo da planilha.")
  .transform((value) => Buffer.from(value.replace(/^data:[^,]*,/, ""), "base64"))
  .refine((buffer) => buffer.length > 0, "Envie o arquivo da planilha.")
  .refine((buffer) => buffer.length <= MAX_FILE_BYTES, "O arquivo passa de 5 MB.");

export const importPreviewSchema = z.object({
  arquivo,
  nomeArquivo: z.string().trim().max(200).optional(),
});

// Para cada duplicado contra a base (RF-I06): pular a linha ou atualizar o cadastro existente.
export const importConfirmSchema = importPreviewSchema.extend({
  decisoes: z.record(z.string().regex(/^\d+$/, "Linha inválida."), z.enum(["pular", "atualizar"], "Decisão inválida.")).default({}),
  // RF-I07: quem importa declara que a igreja tem os consentimentos.
  declaracao: z.literal(true, "Confirme a declaração de consentimento para importar."),
});

export type ImportPreviewPayload = z.infer<typeof importPreviewSchema>;
export type ImportConfirmPayload = z.infer<typeof importConfirmSchema>;

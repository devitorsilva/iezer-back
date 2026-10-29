import { z } from "zod";
import { ANNOUNCEMENT_CHURCH_STATUSES } from "../../../lib/announcements.js";

const id = z.string().cuid();

export const announcementParamsSchema = z.object({ id });

export const listAnnouncementsQuerySchema = z.object({
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["RASCUNHO", "AGENDADO", "NO_AR", "ENCERRADO"], "Status inválido.").optional(),
  ),
});

const dateTime = (message: string) => z.iso.datetime({ offset: true, message }).transform((value) => new Date(value));

// Link opcional, só https (o texto vai para a faixa e o e-mail de todas as igrejas).
const linkField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .trim()
    .max(500, "Link muito longo.")
    .pipe(z.url({ protocol: /^https$/, message: "Informe um link que comece com https://." }))
    .optional(),
);

// Novo aviso e edição (RF-BO44, RF-BO45): a edição manda o aviso inteiro.
export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(3, "Informe o título.").max(80, "Título muito longo (até 80 caracteres)."),
    body: z.string().trim().min(1, "Informe o texto.").max(280, "Texto muito longo (até 280 caracteres)."),
    linkUrl: linkField,
    level: z.enum(["INFORMATIVO", "MANUTENCAO", "IMPORTANTE"], "Nível inválido."),
    startsAt: dateTime("Informe o início."),
    endsAt: dateTime("Informe o fim."),
    audience: z.enum(["TODAS", "SITUACAO", "ESCOLHIDAS"], "Público inválido."),
    churchStatuses: z.array(z.enum(ANNOUNCEMENT_CHURCH_STATUSES, "Situação inválida.")).default([]),
    churchIds: z.array(id).max(500, "Escolha até 500 igrejas.").default([]),
    recipients: z.enum(["TODOS", "ADMINS"], "Destinatários inválidos."),
    sendEmail: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    if (input.endsAt <= input.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim precisa ser depois do início." });
    }
    if (input.audience === "SITUACAO" && input.churchStatuses.length === 0) {
      ctx.addIssue({ code: "custom", path: ["churchStatuses"], message: "Escolha ao menos uma situação." });
    }
    if (input.audience === "ESCOLHIDAS" && input.churchIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["churchIds"], message: "Escolha ao menos uma igreja." });
    }
  })
  .transform((input) => ({
    ...input,
    linkUrl: input.linkUrl ?? null,
    churchStatuses:
      input.audience === "SITUACAO"
        ? ANNOUNCEMENT_CHURCH_STATUSES.filter((status) => input.churchStatuses.includes(status))
        : [],
    churchIds: input.audience === "ESCOLHIDAS" ? [...new Set(input.churchIds)] : [],
  }));

export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

import { z } from "zod";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

const cuid = z.string().cuid();

export const recurrenceSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.coerce.number().int().positive().default(1),
  weekdays: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).optional(),
  count: z.coerce.number().int().positive().optional(),
  endsAtLocal: optionalText,
  startsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/),
}).superRefine((value, ctx) => {
  if (value.frequency === "WEEKLY" && !value.weekdays?.length) {
    ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Selecione ao menos um dia da semana." });
  }
  if (value.count && value.endsAtLocal) {
    ctx.addIssue({ code: "custom", path: ["count"], message: "Use quantidade ou data final, não ambas." });
  }
});

const eventPayloadBaseSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: optionalText,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  allDay: z.boolean().default(false),
  timezone: z.string().trim().min(1).default("America/Sao_Paulo"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  locationType: z.enum(["INTERNO", "EXTERNO"]),
  externalLocationName: optionalText,
  externalAddress: optionalText,
  participantVisibility: z.enum(["SOMENTE_LIDERES", "NOMES", "NOMES_E_RESPOSTAS"]).default("SOMENTE_LIDERES"),
  leaderIds: z.array(cuid).default([]),
  participants: z.array(z.object({ personId: cuid, type: z.enum(["CONVIDADO", "CONVOCADO"]) })).default([]),
  recurrence: recurrenceSchema.optional(),
  reminderMinutes: z.array(z.coerce.number().int().nonnegative()).default([1440]),
  spaceIds: z.array(cuid).default([]),
});

export const eventPayloadSchema = eventPayloadBaseSchema.superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O término deve ser posterior ao início." });
  if (value.locationType === "EXTERNO" && !value.externalLocationName) ctx.addIssue({ code: "custom", path: ["externalLocationName"], message: "Informe o local externo." });
});

export const eventUpdateSchema = eventPayloadBaseSchema.partial().extend({
  recurrence: recurrenceSchema.nullable().optional(),
  scope: z.enum(["THIS", "THIS_AND_FUTURE", "SERIES"]).default("SERIES"),
  occurrenceId: cuid.optional(),
}).superRefine((value, ctx) => {
  if (value.scope !== "SERIES" && !value.occurrenceId) ctx.addIssue({ code: "custom", path: ["occurrenceId"], message: "Informe a ocorrência." });
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O término deve ser posterior ao início." });
  }
});

export const eventListQuerySchema = z.object({ from: z.coerce.date(), to: z.coerce.date() }).refine((v) => v.to > v.from, { message: "Intervalo inválido." });
export const eventDetailQuerySchema = z.object({ occurrenceId: cuid.optional() });
export const idParamsSchema = z.object({ id: cuid });
export const cancelSchema = z.object({
  scope: z.enum(["THIS", "THIS_AND_FUTURE", "SERIES"]).default("SERIES"),
  occurrenceId: cuid.optional(),
  reason: optionalText,
}).superRefine((value, ctx) => {
  if (value.scope !== "SERIES" && !value.occurrenceId) {
    ctx.addIssue({ code: "custom", path: ["occurrenceId"], message: "Informe a ocorrência." });
  }
});

export type EventPayload = z.infer<typeof eventPayloadSchema>;
export type EventUpdate = z.infer<typeof eventUpdateSchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type CancelPayload = z.infer<typeof cancelSchema>;

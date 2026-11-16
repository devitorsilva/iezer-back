import { z } from "zod";

const cuid = z.string().cuid();
const optionalText = z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().optional());

export const occurrenceParamsSchema = z.object({ id: cuid });
export const occurrenceUpdateSchema = z.object({
  startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(), title: optionalText,
  description: optionalText, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  locationType: z.enum(["INTERNO", "EXTERNO"]).optional(), locationName: optionalText, address: optionalText,
});
export const responseSchema = z.object({
  personId: cuid.optional(), response: z.enum(["VOU", "NAO_VOU", "TALVEZ"]),
  acknowledged: z.boolean().optional(), justification: optionalText,
});
export const scaleSchema = z.object({
  items: z.array(z.object({ personId: cuid, status: z.enum(["PENDENTE", "ACEITO", "RECUSADO"]).default("PENDENTE") })).max(500),
});
export const attendanceSchema = z.object({
  items: z.array(z.object({ personId: cuid, status: z.enum(["PRESENTE", "AUSENTE", "JUSTIFICADO"]), justification: optionalText })).max(1000),
});

export type OccurrenceUpdate = z.infer<typeof occurrenceUpdateSchema>;
export type ResponsePayload = z.infer<typeof responseSchema>;
export type ScalePayload = z.infer<typeof scaleSchema>;
export type AttendancePayload = z.infer<typeof attendanceSchema>;

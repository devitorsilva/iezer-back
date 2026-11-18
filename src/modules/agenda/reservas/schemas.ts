import { z } from "zod";

export const reservationParamsSchema = z.object({ id: z.string().min(1) });

const utcInstant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const reservationQuerySchema = z.object({
  from: utcInstant.optional(),
  to: utcInstant.optional(),
  spaceId: z.string().min(1).optional(),
  status: z.enum(["ATIVA", "LIBERADA", "CANCELADA"]).optional(),
}).refine((value) => !value.from || !value.to || value.to > value.from, { message: "O fim do período deve ser posterior ao início.", path: ["to"] });

export const reservationPayloadSchema = z.object({
  title: z.string().trim().min(2).max(160),
  spaceIds: z.array(z.string().min(1)).min(1).max(20).transform((ids) => [...new Set(ids)]),
  startsAt: utcInstant,
  endsAt: utcInstant,
}).refine((value) => value.endsAt > value.startsAt, { message: "O fim da reserva deve ser posterior ao início.", path: ["endsAt"] });

export type ReservationQuery = z.infer<typeof reservationQuerySchema>;
export type ReservationPayload = z.infer<typeof reservationPayloadSchema>;

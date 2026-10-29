import { z } from "zod";

// O que o parente é da pessoa da ficha (RF-F13). Vira uma linha PAI_MAE (num sentido ou no outro) ou
// CONJUGE.
export const RELATIVE_TYPES = ["PAI_MAE", "FILHO", "CONJUGE"] as const;

export const relativeCreateSchema = z.object({
  personId: z.string().cuid("Pessoa inválida."),
  type: z.enum(RELATIVE_TYPES, "Parentesco inválido."),
});

export const relativeParamsSchema = z.object({
  id: z.string().cuid(),
});

export const relationParamsSchema = z.object({
  id: z.string().cuid(),
  relationId: z.string().cuid(),
});

export type RelativeType = (typeof RELATIVE_TYPES)[number];
export type RelativeCreatePayload = z.infer<typeof relativeCreateSchema>;

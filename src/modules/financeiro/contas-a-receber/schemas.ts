import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

export const receivablePayloadSchema = z.object({
  description: z.string().trim().min(2, "Descrição é obrigatória."),
  source: z.string().trim().min(2, "Origem é obrigatória."),
  memberId: optionalTrimmedString,
  categoryId: optionalTrimmedString,
  dueDate: z.coerce.date(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero."),
  status: z.enum(["RECEBIDO", "PENDENTE", "ATRASADO"]).default("PENDENTE"),
  notes: optionalTrimmedString,
});

export const receivableParamsSchema = z.object({
  id: z.string().cuid(),
});

export const receivableQuerySchema = z.object({
  q: optionalTrimmedString,
  status: z.enum(["RECEBIDO", "PENDENTE", "ATRASADO"]).optional(),
  categoryId: optionalTrimmedString,
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  overdue: z.preprocess((value) => value === "true" || value === true, z.boolean()).optional(),
});

export type ReceivablePayload = z.infer<typeof receivablePayloadSchema>;
export type ReceivableQuery = z.infer<typeof receivableQuerySchema>;

import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

export const receivablePayloadSchema = z
  .object({
    description: z.string().trim().min(2, "Descricao e obrigatoria."),
    source: z.string().trim().min(2, "Origem e obrigatoria."),
    memberId: optionalTrimmedString,
    categoryId: optionalTrimmedString,
    dueDate: z.coerce.date(),
    amount: z.coerce.number().positive("Valor deve ser maior que zero."),
    status: z.enum(["RECEBIDO", "PENDENTE", "ATRASADO"]).default("PENDENTE"),
    isRecurring: z.boolean().default(false),
    recurrenceFrequency: z.enum(["QUINZENAL", "MENSAL", "ANUAL"]).optional(),
    recurrenceCount: z.coerce.number().int().positive().optional(),
    notes: optionalTrimmedString,
  })
  .superRefine((payload, context) => {
    if (!payload.isRecurring) return;

    if (!payload.recurrenceFrequency) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceFrequency"],
        message: "Periodicidade e obrigatoria para contas recorrentes.",
      });
    }

    if (!payload.recurrenceCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceCount"],
        message: "Quantidade de vezes e obrigatoria para contas recorrentes.",
      });
    }
  });

export const receivableParamsSchema = z.object({
  id: z.string().cuid(),
});

export const receivableDeleteQuerySchema = z.object({
  scope: z.enum(["single", "series"]).default("single"),
});

export const receivableSettlementSchema = z
  .object({
    settledAmount: z.coerce.number().positive("Valor da baixa deve ser maior que zero.").optional(),
    settledAt: z.coerce.date().optional(),
    settlementMethod: optionalTrimmedString,
    settlementBankAccountId: optionalTrimmedString,
  })
  .default({});

export const receivableQuerySchema = z.object({
  q: optionalTrimmedString,
  status: z.enum(["RECEBIDO", "PENDENTE", "ATRASADO"]).optional(),
  categoryId: optionalTrimmedString,
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  overdue: z.preprocess((value) => value === "true" || value === true, z.boolean()).optional(),
});

export type ReceivablePayload = z.infer<typeof receivablePayloadSchema>;
export type ReceivableSettlementPayload = z.infer<typeof receivableSettlementSchema>;
export type ReceivableQuery = z.infer<typeof receivableQuerySchema>;

import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

export const payablePayloadSchema = z
  .object({
    description: z.string().trim().min(2, "Descrição é obrigatória."),
    supplierId: optionalTrimmedString,
    categoryId: optionalTrimmedString,
    dueDate: z.coerce.date(),
    amount: z.coerce.number().positive("Valor deve ser maior que zero."),
    status: z.enum(["PAGO", "PENDENTE", "ATRASADO"]).default("PENDENTE"),
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
        message: "Periodicidade é obrigatória para contas recorrentes.",
      });
    }

    if (!payload.recurrenceCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceCount"],
        message: "Quantidade de vezes é obrigatória para contas recorrentes.",
      });
    }
  });

export const payableParamsSchema = z.object({
  id: z.string().cuid(),
});

export const payableDeleteQuerySchema = z.object({
  scope: z.enum(["single", "series"]).default("single"),
});

export const payableQuerySchema = z.object({
  q: optionalTrimmedString,
  status: z.enum(["PAGO", "PENDENTE", "ATRASADO"]).optional(),
  categoryId: optionalTrimmedString,
  dueFrom: z.coerce.date().optional(),
  dueTo: z.coerce.date().optional(),
  overdue: z.preprocess((value) => value === "true" || value === true, z.boolean()).optional(),
});

export type PayablePayload = z.infer<typeof payablePayloadSchema>;
export type PayableQuery = z.infer<typeof payableQuerySchema>;

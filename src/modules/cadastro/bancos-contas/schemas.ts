import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();
    return trimmedValue === "" ? undefined : trimmedValue;
  },
  z.string().optional(),
);

export const bankAccountPayloadSchema = z.object({
  bankName: z.string().trim().min(2, "Banco é obrigatório."),
  accountName: z.string().trim().min(2, "Nome da conta é obrigatório."),
  accountType: z
    .enum(["CONTA_CORRENTE", "CONTA_POUPANCA", "CAIXA", "INVESTIMENTO", "OUTRA"])
    .default("CONTA_CORRENTE"),
  agency: optionalTrimmedString,
  accountNumber: optionalTrimmedString,
  pixKey: optionalTrimmedString,
  openingBalance: z.coerce.number().default(0),
  notes: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const bankAccountParamsSchema = z.object({
  id: z.string().cuid(),
});

export type BankAccountPayload = z.infer<typeof bankAccountPayloadSchema>;

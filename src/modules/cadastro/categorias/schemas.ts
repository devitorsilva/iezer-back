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

export const categoryPayloadSchema = z.object({
  name: z.string().trim().min(2, "Nome é obrigatório."),
  type: z.enum(["PAGAR", "RECEBER", "AMBOS"]).default("AMBOS"),
  description: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const categoryParamsSchema = z.object({
  id: z.string().cuid(),
});

export type CategoryPayload = z.infer<typeof categoryPayloadSchema>;

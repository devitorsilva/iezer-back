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

export const costCenterPayloadSchema = z.object({
  name: z.string().trim().min(2, "Nome é obrigatório."),
  code: optionalTrimmedString,
  description: optionalTrimmedString,
  isActive: z.boolean().default(true),
});

export const costCenterParamsSchema = z.object({
  id: z.string().cuid(),
});

export type CostCenterPayload = z.infer<typeof costCenterPayloadSchema>;

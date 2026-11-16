import { z } from "zod";

export const spaceParamsSchema = z.object({ id: z.string().min(1) });

export const spacePayloadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  preparationMinutes: z.number().int().min(0).max(1440).default(0),
  cleanupMinutes: z.number().int().min(0).max(1440).default(0),
  isActive: z.boolean().default(true),
});

export type SpacePayload = z.infer<typeof spacePayloadSchema>;

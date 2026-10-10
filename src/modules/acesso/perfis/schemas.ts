import { z } from "zod";

export const accessProfileParamsSchema = z.object({
  id: z.string().cuid(),
});

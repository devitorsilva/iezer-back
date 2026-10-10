import { z } from "zod";

export { changeEmailSchema, type ChangeEmailInput } from "../convites/schemas.js";

export const userParamsSchema = z.object({
  id: z.string().cuid(),
});

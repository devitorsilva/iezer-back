import { z } from "zod";

export { changeEmailSchema, type ChangeEmailInput } from "../../acesso/convites/schemas.js";
export { inviteTokenParamsSchema as emailTokenParamsSchema } from "../../acesso/convites/schemas.js";

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);

// Trocar a senha pede a atual; quem só usa Google define uma sem ela (RF-MC02).
export const changePasswordSchema = z.object({
  currentPassword: optionalString,
  newPassword: z.string().min(1, "Informe a nova senha."),
});

export const sessionParamsSchema = z.object({
  id: z.string().cuid(),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

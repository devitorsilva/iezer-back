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

// Reconfigurar o app autenticador (RF-BO05): confirma com a senha.
export const reconfigureTwoFactorSchema = z.object({
  password: z.string("Digite a sua senha para confirmar.").min(1, "Digite a sua senha para confirmar."),
});

export const sessionParamsSchema = z.object({
  id: z.string().cuid(),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ReconfigureTwoFactorInput = z.infer<typeof reconfigureTwoFactorSchema>;

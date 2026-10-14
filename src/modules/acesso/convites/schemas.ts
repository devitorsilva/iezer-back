import { z } from "zod";

const id = z.string().cuid();

export const inviteParamsSchema = z.object({ id });

export const inviteTokenParamsSchema = z.object({
  token: z.string().min(20).max(200),
});

const emailField = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .pipe(z.email("E-mail inválido.").max(254))
  .transform((value) => value.toLowerCase());

// Linha organização × perfis (RF-CV02), também usada ao editar os acessos de um usuário.
export const assignmentRowSchema = z.object({
  organizationId: id,
  profileIds: z.array(id).min(1, "Escolha ao menos um perfil."),
});

export const createInviteSchema = z.object({
  personId: id,
  assignments: z.array(assignmentRowSchema).min(1, "Escolha ao menos uma organização e um perfil."),
});

export const resendInviteSchema = z
  .object({
    // false: só gera um link novo para "Copiar link" (o anterior deixa de valer).
    sendEmail: z.boolean().default(true),
  })
  .default({ sendEmail: true });

export const changeEmailSchema = z.object({ email: emailField });

export const acceptInviteSchema = z.object({
  password: z.string().min(1, "Defina uma senha."),
  acceptTerms: z.literal(true, "Aceite os termos para continuar."),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

import { z } from "zod";
import { TEAM_ROLES } from "../../../lib/team.js";

const id = z.string().cuid();

export const teamParamsSchema = z.object({ id });

export const teamTokenParamsSchema = z.object({
  token: z.string().min(20).max(200),
});

const emailField = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .pipe(z.email("E-mail inválido.").max(254))
  .transform((value) => value.toLowerCase());

// Um ou mais papéis, sem repetição (B3: os papéis se somam).
const rolesField = z
  .array(z.enum(TEAM_ROLES, "Papel inválido."))
  .min(1, "Escolha ao menos um papel.")
  .transform((roles) => TEAM_ROLES.filter((role) => roles.includes(role)));

export const createTeamInviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120, "Nome muito longo."),
  email: emailField,
  roles: rolesField,
});

export const resendTeamInviteSchema = z
  .object({
    // false: só gera um link novo para "Copiar link" (o anterior deixa de valer).
    sendEmail: z.boolean().default(true),
  })
  .default({ sendEmail: true });

export const changeTeamRolesSchema = z.object({ roles: rolesField });

export const acceptTeamInviteSchema = z.object({
  password: z.string().min(1, "Defina uma senha."),
  acceptTerms: z.literal(true, "Aceite o termo de confidencialidade para continuar."),
});

export type CreateTeamInviteInput = z.infer<typeof createTeamInviteSchema>;
export type AcceptTeamInviteInput = z.infer<typeof acceptTeamInviteSchema>;

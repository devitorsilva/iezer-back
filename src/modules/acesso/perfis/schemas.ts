import { z } from "zod";

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const accessProfileParamsSchema = z.object({
  id: z.string().cuid(),
});

// Criar, editar e duplicar (RF-PF02). Duplicar é um POST com as permissões do original.
export const accessProfileBodySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do perfil.").max(60, "Use até 60 caracteres."),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(200, "Use até 200 caracteres.").optional()),
  permissions: z.array(z.string()).max(200),
});

export const deleteAccessProfileSchema = z
  .object({
    // Obrigatório quando o perfil tem usuários ou convites pendentes (RF-PF04).
    moveToProfileId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  })
  .default({});

export type AccessProfileBody = z.infer<typeof accessProfileBodySchema>;
export type DeleteAccessProfileInput = z.infer<typeof deleteAccessProfileSchema>;

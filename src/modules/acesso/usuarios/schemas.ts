import { z } from "zod";
import { assignmentRowSchema } from "../convites/schemas.js";

export { changeEmailSchema, type ChangeEmailInput } from "../convites/schemas.js";

export const userParamsSchema = z.object({
  id: z.string().cuid(),
});

// Substitui as atribuições nas organizações em que quem edita gerencia usuários (RF-US02).
// Organização fora da lista perde as atribuições dali.
export const updateAssignmentsSchema = z.object({
  assignments: z.array(assignmentRowSchema),
});

export type UpdateAssignmentsInput = z.infer<typeof updateAssignmentsSchema>;

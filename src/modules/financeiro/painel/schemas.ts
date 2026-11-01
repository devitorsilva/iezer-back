import { z } from "zod";

export const financePanelQuerySchema = z.object({
  periodo: z.enum(["hoje", "mes", "ano"], { message: "Período inválido." }).default("mes"),
});

export type FinancePanelPeriod = z.infer<typeof financePanelQuerySchema>["periodo"];

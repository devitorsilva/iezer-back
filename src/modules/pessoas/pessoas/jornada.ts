import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { addDays, parseCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { prisma } from "../../../lib/prisma.js";

// Indicadores da jornada no Painel (PRD Pessoas › Indicadores da jornada, RT-B13, RF-P10).
// O mesmo filtro conta no Painel e monta a lista em GET /pessoas?indicador=.

export const JOURNEY_INDICATORS = [
  "visitantes_recentes",
  "visitantes_sem_acompanhamento",
  "contato_desatualizado",
  "congregados_discipulado",
] as const;

export type JourneyIndicator = (typeof JOURNEY_INDICATORS)[number];

// Prazos em dias, por igreja (`Organization.peopleSettings` da sede). Padrão de fábrica provisório,
// a definir com a piloto.
const settingsSchema = z.object({
  visitorDays: z.number().int().min(1).max(3650).catch(30),
  followUpDays: z.number().int().min(1).max(3650).catch(15),
  contactStaleDays: z.number().int().min(1).max(3650).catch(365),
  congregationDays: z.number().int().min(1).max(3650).catch(180),
});

export type JourneySettings = z.infer<typeof settingsSchema>;

const SETTING_BY_INDICATOR: Record<JourneyIndicator, keyof JourneySettings> = {
  visitantes_recentes: "visitorDays",
  visitantes_sem_acompanhamento: "followUpDays",
  contato_desatualizado: "contactStaleDays",
  congregados_discipulado: "congregationDays",
};

export async function loadJourneySettings(churchId: string): Promise<JourneySettings> {
  const church = await prisma.organization.findUnique({ where: { id: churchId }, select: { peopleSettings: true } });
  const stored = church?.peopleSettings;
  return settingsSchema.parse(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {});
}

export function indicatorDays(indicator: JourneyIndicator, settings: JourneySettings) {
  return settings[SETTING_BY_INDICATOR[indicator]];
}

// Sempre só quem está Ativo.
export function indicatorWhere(indicator: JourneyIndicator, settings: JourneySettings): Prisma.PersonWhereInput {
  const today = parseCivilDate(todayCivil());
  const since = (days: number) => addDays(today, -days);

  switch (indicator) {
    case "visitantes_recentes":
      return { status: "ATIVO", bond: "VISITANTE", firstVisitDate: { gte: since(settings.visitorDays) } };
    case "visitantes_sem_acompanhamento":
      return {
        status: "ATIVO",
        bond: "VISITANTE",
        followUps: { none: { date: { gte: since(settings.followUpDays) } } },
      };
    case "contato_desatualizado":
      return { status: "ATIVO", contactUpdatedAt: { lt: addDays(new Date(), -settings.contactStaleDays) } };
    case "congregados_discipulado":
      return {
        status: "ATIVO",
        bond: "CONGREGADO",
        isBaptized: false,
        OR: [{ bondSince: null }, { bondSince: { lte: since(settings.congregationDays) } }],
      };
  }
}

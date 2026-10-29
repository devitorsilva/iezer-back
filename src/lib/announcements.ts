import type { AnnouncementAudience, AnnouncementLevel, OrganizationStatus, Prisma } from "@prisma/client";

// Avisos em massa (B13, RT-BB10): regras comuns ao back-office, ao app das igrejas e ao envio do
// e-mail.

export type AnnouncementStatus = "RASCUNHO" | "AGENDADO" | "NO_AR" | "ENCERRADO";

// Só igreja em Implantação ou Ativa vê aviso (RF-BO45).
export const ANNOUNCEMENT_CHURCH_STATUSES = ["IMPLANTACAO", "ATIVA"] as const satisfies readonly OrganizationStatus[];

export const ANNOUNCEMENT_LEVEL_LABELS: Record<AnnouncementLevel, string> = {
  INFORMATIVO: "Informativo",
  MANUTENCAO: "Manutenção",
  IMPORTANTE: "Importante",
};

// Informativo e manutenção podem ser dispensados; o importante fica até o fim (RF-BO47).
export const isDismissible = (level: AnnouncementLevel) => level !== "IMPORTANTE";

// Status calculado, como o `grantStatus` do suporte: nada de job para mudar de agendado a no ar.
export function announcementStatus(
  announcement: { publishedAt: Date | null; closedAt: Date | null; startsAt: Date; endsAt: Date },
  now = new Date(),
): AnnouncementStatus {
  if (!announcement.publishedAt) return "RASCUNHO";
  if (announcement.closedAt || announcement.endsAt <= now) return "ENCERRADO";
  if (announcement.startsAt > now) return "AGENDADO";
  return "NO_AR";
}

// No ar agora: publicado, já começou, não acabou e não foi encerrado.
export const liveAnnouncementWhere = (now = new Date()) =>
  ({
    publishedAt: { not: null },
    closedAt: null,
    startsAt: { lte: now },
    endsAt: { gt: now },
  }) satisfies Prisma.AnnouncementWhereInput;

// Avisos cujo público inclui a igreja (sede), pela situação dela.
export const announcementForChurchWhere = (church: { id: string; status: OrganizationStatus }) =>
  ({
    OR: [
      { audience: "TODAS" },
      { audience: "SITUACAO", churchStatuses: { has: church.status } },
      { audience: "ESCOLHIDAS", churches: { some: { organizationId: church.id } } },
    ],
  }) satisfies Prisma.AnnouncementWhereInput;

// Igrejas (sedes) alcançadas por um aviso.
export const churchesForAnnouncementWhere = (announcement: {
  id: string;
  audience: AnnouncementAudience;
  churchStatuses: OrganizationStatus[];
}) => {
  const statuses = ANNOUNCEMENT_CHURCH_STATUSES.filter(
    (status) => announcement.audience !== "SITUACAO" || announcement.churchStatuses.includes(status),
  );

  return {
    type: "SEDE",
    parentId: null,
    status: { in: statuses },
    ...(announcement.audience === "ESCOLHIDAS" ? { announcements: { some: { announcementId: announcement.id } } } : {}),
  } satisfies Prisma.OrganizationWhereInput;
};

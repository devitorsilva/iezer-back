import type { Prisma } from "@prisma/client";
import {
  ANNOUNCEMENT_CHURCH_STATUSES,
  announcementForChurchWhere,
  isDismissible,
  liveAnnouncementWhere,
} from "../../../lib/announcements.js";
import { findUserChurch } from "../../../lib/church.js";
import { AppError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { dispatchDueAnnouncementEmails } from "../../admin/avisos/envio.js";
import { activeAdminWhere } from "../../admin/igrejas/situacao.js";

export class MyAnnouncementNotFoundError extends Error {
  constructor() {
    super("ANNOUNCEMENT_NOT_FOUND");
  }
}

// Avisos que o usuário de igreja pode ver agora (RT-BB10): no ar, com a igreja dele no público e,
// em "só admins", só para quem é admin ativo (regra das travas). Igreja suspensa ou encerrada não
// chega aqui (CHURCH_SUSPENDED), mas o filtro de situação fica por garantia.
async function visibleWhere(userId: string, now: Date): Promise<Prisma.AnnouncementWhereInput | null> {
  const church = await findUserChurch(userId);
  if (!church) return null;

  const sede = await prisma.organization.findUnique({ where: { id: church.id }, select: { id: true, status: true } });
  if (!sede || !(ANNOUNCEMENT_CHURCH_STATUSES as readonly string[]).includes(sede.status)) return null;

  const isAdmin = (await prisma.user.count({ where: { id: userId, ...activeAdminWhere(sede.id) } })) > 0;

  return {
    AND: [liveAnnouncementWhere(now), announcementForChurchWhere(sede), isAdmin ? {} : { recipients: "TODOS" }],
  };
}

// Faixa de avisos do app das igrejas (RF-BO47): sem os dispensados, o nível mais alto primeiro.
export async function listMyAnnouncements(userId: string) {
  void dispatchDueAnnouncementEmails();

  const where = await visibleWhere(userId, new Date());
  if (!where) return [];

  const rows = await prisma.announcement.findMany({
    where: { AND: [where, { views: { none: { userId, dismissedAt: { not: null } } } }] },
    select: {
      id: true,
      title: true,
      body: true,
      linkUrl: true,
      level: true,
      startsAt: true,
      endsAt: true,
      views: { where: { userId }, select: { seenAt: true } },
    },
    orderBy: [{ level: "desc" }, { startsAt: "desc" }],
  });

  return rows.map(({ views, ...row }) => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    dismissible: isDismissible(row.level),
    seen: views.length > 0,
  }));
}

async function findVisibleOrThrow(userId: string, id: string, now: Date) {
  const where = await visibleWhere(userId, now);
  const announcement = where
    ? await prisma.announcement.findFirst({ where: { AND: [where, { id }] }, select: { id: true, level: true } })
    : null;
  if (!announcement) throw new MyAnnouncementNotFoundError();
  return announcement;
}

// Visto quando a faixa aparece (RF-BO49): grava só a primeira vez.
export async function markAnnouncementSeen(userId: string, id: string) {
  await findVisibleOrThrow(userId, id, new Date());
  await prisma.announcementView.upsert({
    where: { announcementId_userId: { announcementId: id, userId } },
    create: { announcementId: id, userId },
    update: {},
  });
  return { seen: true };
}

// Dispensar: só informativo e manutenção; o importante fica até o fim (RF-BO47).
export async function dismissAnnouncement(userId: string, id: string) {
  const now = new Date();
  const announcement = await findVisibleOrThrow(userId, id, now);
  if (!isDismissible(announcement.level)) {
    throw new AppError(409, "ANNOUNCEMENT_NOT_DISMISSIBLE", "Este aviso fica visível até o fim e não pode ser dispensado.");
  }

  await prisma.announcementView.upsert({
    where: { announcementId_userId: { announcementId: id, userId } },
    create: { announcementId: id, userId, seenAt: now, dismissedAt: now },
    update: { dismissedAt: now },
  });
  return { dismissed: true };
}

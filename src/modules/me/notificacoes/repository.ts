import { prisma } from "../../../lib/prisma.js";

export interface NotificationListFilters {
  userId: string;
  organizationIds: string[];
  unreadOnly: boolean;
  limit: number;
  cursor?: string;
}

const notificationSelect = {
  id: true,
  organizationId: true,
  occurrenceId: true,
  title: true,
  body: true,
  linkUrl: true,
  readAt: true,
  createdAt: true,
} as const;

export class MyAgendaNotificationRepository {
  list(filters: NotificationListFilters) {
    return prisma.agendaNotification.findMany({
      where: {
        userId: filters.userId,
        organizationId: { in: filters.organizationIds },
        readAt: filters.unreadOnly ? null : undefined,
      },
      select: notificationSelect,
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      take: filters.limit + 1,
      cursor: filters.cursor ? { id: filters.cursor } : undefined,
      skip: filters.cursor ? 1 : undefined,
    });
  }

  unreadCount(userId: string, organizationIds: string[]) {
    return prisma.agendaNotification.count({
      where: { userId, organizationId: { in: organizationIds }, readAt: null },
    });
  }

  updateReadState(input: {
    userId: string;
    organizationIds: string[];
    ids?: string[];
    readAt: Date | null;
  }) {
    return prisma.agendaNotification.updateMany({
      where: {
        userId: input.userId,
        organizationId: { in: input.organizationIds },
        id: input.ids ? { in: input.ids } : undefined,
      },
      data: { readAt: input.readAt },
    });
  }
}

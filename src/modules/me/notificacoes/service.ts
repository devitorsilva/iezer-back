import { MyAgendaNotificationRepository } from "./repository.js";

export interface ListMyNotificationsInput {
  userId: string;
  organizationIds: string[];
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ChangeMyNotificationsInput {
  userId: string;
  organizationIds: string[];
  ids?: string[];
  all?: boolean;
  read: boolean;
}

export class MyAgendaNotificationService {
  constructor(private readonly repository = new MyAgendaNotificationRepository()) {}

  async list(input: ListMyNotificationsInput) {
    const limit = Math.max(1, Math.min(100, input.limit ?? 30));
    const [rows, unreadCount] = await Promise.all([
      this.repository.list({
        userId: input.userId,
        organizationIds: input.organizationIds,
        unreadOnly: input.unreadOnly ?? false,
        limit,
        cursor: input.cursor,
      }),
      this.repository.unreadCount(input.userId, input.organizationIds),
    ]);
    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit);

    return {
      items: items.map((item) => ({
        ...item,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      unreadCount,
      nextCursor: hasNextPage ? items.at(-1)?.id ?? null : null,
    };
  }

  async changeReadState(input: ChangeMyNotificationsInput) {
    const ids = input.ids ? [...new Set(input.ids)] : undefined;
    if (!input.all && (!ids || ids.length === 0)) {
      throw new InvalidNotificationSelectionError();
    }

    const result = await this.repository.updateReadState({
      userId: input.userId,
      organizationIds: input.organizationIds,
      ids: input.all ? undefined : ids,
      readAt: input.read ? new Date() : null,
    });

    return { updated: result.count };
  }
}

export class InvalidNotificationSelectionError extends Error {
  constructor() {
    super("NOTIFICATION_SELECTION_REQUIRED");
  }
}

import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { AnnouncementInput } from "./schemas.js";

type Db = Prisma.TransactionClient;

const announcementInclude = {
  createdBy: { select: { name: true } },
  publishedBy: { select: { name: true } },
  churches: {
    select: { organization: { select: { id: true, name: true, status: true } } },
    orderBy: { organization: { name: "asc" } },
  },
} satisfies Prisma.AnnouncementInclude;

export type AnnouncementRow = Prisma.AnnouncementGetPayload<{ include: typeof announcementInclude }>;

export interface AnnouncementCounts {
  seen: number;
  dismissed: number;
}

const toData = ({ churchIds: _churchIds, ...input }: AnnouncementInput) => input;

export class AnnouncementRepository {
  findMany() {
    return prisma.announcement.findMany({ include: announcementInclude, orderBy: { createdAt: "desc" }, take: 500 });
  }

  findById(id: string, db: Db = prisma) {
    return db.announcement.findUnique({ where: { id }, include: announcementInclude });
  }

  // Quantos viram e quantos dispensaram (RF-BO49).
  async counts(ids: string[]): Promise<Map<string, AnnouncementCounts>> {
    if (ids.length === 0) return new Map();

    const [seen, dismissed] = await Promise.all([
      prisma.announcementView.groupBy({ by: ["announcementId"], where: { announcementId: { in: ids } }, _count: true }),
      prisma.announcementView.groupBy({
        by: ["announcementId"],
        where: { announcementId: { in: ids }, dismissedAt: { not: null } },
        _count: true,
      }),
    ]);
    const seenById = new Map(seen.map((row) => [row.announcementId, row._count]));
    const dismissedById = new Map(dismissed.map((row) => [row.announcementId, row._count]));

    return new Map(ids.map((id) => [id, { seen: seenById.get(id) ?? 0, dismissed: dismissedById.get(id) ?? 0 }]));
  }

  // Igrejas escolhidas que podem receber aviso: sedes em Implantação ou Ativa.
  countEligibleChurches(ids: string[], db: Db) {
    return db.organization.count({
      where: { id: { in: ids }, type: "SEDE", parentId: null, status: { in: ["IMPLANTACAO", "ATIVA"] } },
    });
  }

  create(input: AnnouncementInput, createdById: string, db: Db) {
    return db.announcement.create({
      data: {
        ...toData(input),
        createdById,
        churches: { create: input.churchIds.map((organizationId) => ({ organizationId })) },
      },
      include: announcementInclude,
    });
  }

  // Edição só antes de entrar no ar: o `where` confere que o aviso ainda não começou, contra uma
  // publicação ou um início que passou entre a leitura e a escrita.
  async update(id: string, input: AnnouncementInput, now: Date, db: Db) {
    const { count } = await db.announcement.updateMany({
      where: { id, closedAt: null, OR: [{ publishedAt: null }, { startsAt: { gt: now } }] },
      data: toData(input),
    });
    if (count === 0) return null;

    await db.announcementChurch.deleteMany({ where: { announcementId: id } });
    if (input.churchIds.length > 0) {
      await db.announcementChurch.createMany({
        data: input.churchIds.map((organizationId) => ({ announcementId: id, organizationId })),
      });
    }
    return this.findById(id, db);
  }

  async publish(id: string, publishedById: string, now: Date, db: Db) {
    const { count } = await db.announcement.updateMany({
      where: { id, publishedAt: null, endsAt: { gt: now } },
      data: { publishedAt: now, publishedById },
    });
    return count > 0;
  }

  async close(id: string, now: Date, db: Db) {
    const { count } = await db.announcement.updateMany({
      where: { id, publishedAt: { not: null }, closedAt: null, endsAt: { gt: now } },
      data: { closedAt: now },
    });
    return count > 0;
  }

  async deleteDraft(id: string, db: Db) {
    const { count } = await db.announcement.deleteMany({ where: { id, publishedAt: null } });
    return count > 0;
  }
}

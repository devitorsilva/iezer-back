import type { OrganizationContactRole, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

type Db = Prisma.TransactionClient;

const churchInclude = {
  contacts: true,
  children: { orderBy: { name: "asc" } },
} satisfies Prisma.OrganizationInclude;

export type ChurchWithRelations = Prisma.OrganizationGetPayload<{ include: typeof churchInclude }>;

export class OrganizationRepository {
  findChurch(churchId: string, db: Db = prisma): Promise<ChurchWithRelations | null> {
    return db.organization.findFirst({ where: { id: churchId, type: "SEDE" }, include: churchInclude });
  }

  findChurchByCnpj(cnpj: string, db: Db = prisma) {
    return db.organization.findFirst({ where: { cnpj, parentId: null }, select: { id: true, name: true } });
  }

  findCongregation(id: string, churchId: string, db: Db = prisma) {
    return db.organization.findFirst({ where: { id, parentId: churchId } });
  }

  // Nome repetido entre as organizações da igreja, sem diferenciar maiúsculas.
  async nameTaken(churchId: string, name: string, ignoreId: string | undefined, db: Db = prisma) {
    const count = await db.organization.count({
      where: {
        OR: [{ id: churchId }, { parentId: churchId }],
        name: { equals: name, mode: "insensitive" },
        id: ignoreId ? { not: ignoreId } : undefined,
      },
    });
    return count > 0;
  }

  async slugTaken(slug: string, db: Db = prisma) {
    return (await db.organization.count({ where: { slug } })) > 0;
  }

  updateOrganization(id: string, data: Prisma.OrganizationUpdateInput, db: Db = prisma) {
    return db.organization.update({ where: { id }, data });
  }

  createCongregation(data: { churchId: string; name: string; slug: string }, db: Db = prisma) {
    return db.organization.create({
      data: { name: data.name, slug: data.slug, type: "CONGREGACAO", parentId: data.churchId },
    });
  }

  upsertContact(
    organizationId: string,
    role: OrganizationContactRole,
    data: { name: string; jobTitle: string | null; email: string; phone: string | null },
    db: Db = prisma,
  ) {
    return db.organizationContact.upsert({
      where: { organizationId_role: { organizationId, role } },
      create: { organizationId, role, ...data },
      update: data,
    });
  }

  deleteContact(organizationId: string, role: OrganizationContactRole, db: Db = prisma) {
    return db.organizationContact.deleteMany({ where: { organizationId, role } });
  }
}

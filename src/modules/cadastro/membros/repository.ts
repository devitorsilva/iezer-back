import type { Prisma, Person } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { MemberPayload } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class MemberRepository {
  findAll(organizationIds: string[]): Promise<Person[]> {
    return prisma.person.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<Person | null> {
    return db.person.findFirst({
      where: { id, organizationId: { in: organizationIds } },
    });
  }

  create(payload: MemberPayload, organizationId: string, db: Db = prisma): Promise<Person> {
    return db.person.create({
      data: { ...payload, organizationId },
    });
  }

  update(id: string, payload: MemberPayload, db: Db = prisma): Promise<Person> {
    return db.person.update({
      where: { id },
      data: payload,
    });
  }

  delete(id: string, db: Db = prisma): Promise<Person> {
    return db.person.delete({
      where: { id },
    });
  }
}

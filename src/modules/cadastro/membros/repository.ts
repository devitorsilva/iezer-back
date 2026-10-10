import type { Person, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

type Db = Prisma.TransactionClient;

export class MemberRepository {
  findAll(organizationIds: string[]): Promise<Person[]> {
    return prisma.person.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<Person | null> {
    return db.person.findFirst({
      where: { id, organizationId: { in: organizationIds } },
    });
  }

  findByCpf(cpf: string, organizationIds: string[], excludeId: string | null, db: Db) {
    return db.person.findFirst({
      where: { cpf, organizationId: { in: organizationIds }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
  }

  create(data: Prisma.PersonUncheckedCreateInput, db: Db): Promise<Person> {
    return db.person.create({ data });
  }

  update(id: string, data: Prisma.PersonUncheckedUpdateInput, db: Db): Promise<Person> {
    return db.person.update({ where: { id }, data });
  }
}

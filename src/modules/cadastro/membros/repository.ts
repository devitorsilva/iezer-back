import type { Person } from "@prisma/client";
import { DEFAULT_ORGANIZATION_ID } from "../../../lib/organization.js";
import { prisma } from "../../../lib/prisma.js";
import type { MemberPayload } from "./schemas.js";

export class MemberRepository {
  findAll(): Promise<Person[]> {
    return prisma.person.findMany({
      where: { organizationId: DEFAULT_ORGANIZATION_ID },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string): Promise<Person | null> {
    return prisma.person.findUnique({ where: { id } });
  }

  create(payload: MemberPayload): Promise<Person> {
    return prisma.person.create({ data: { ...payload, organizationId: DEFAULT_ORGANIZATION_ID } });
  }

  update(id: string, payload: MemberPayload): Promise<Person> {
    return prisma.person.update({ where: { id }, data: payload });
  }

  delete(id: string): Promise<Person> {
    return prisma.person.delete({ where: { id } });
  }
}

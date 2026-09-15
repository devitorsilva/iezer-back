import type { Member } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { MemberPayload } from "./schemas.js";

export class MemberRepository {
  findAll(): Promise<Member[]> {
    return prisma.member.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string): Promise<Member | null> {
    return prisma.member.findUnique({ where: { id } });
  }

  create(payload: MemberPayload): Promise<Member> {
    return prisma.member.create({ data: payload });
  }

  update(id: string, payload: MemberPayload): Promise<Member> {
    return prisma.member.update({ where: { id }, data: payload });
  }

  delete(id: string): Promise<Member> {
    return prisma.member.delete({ where: { id } });
  }
}

import { Prisma, type Member } from "@prisma/client";
import type { MemberRepository } from "./repository.js";
import type { MemberPayload } from "./schemas.js";

export class MemberNotFoundError extends Error {
  constructor() {
    super("MEMBER_NOT_FOUND");
  }
}

export class MemberDocumentConflictError extends Error {
  constructor() {
    super("MEMBER_DOCUMENT_CONFLICT");
  }
}

function mapMember(member: Member) {
  return {
    ...member,
    birthDate: member.birthDate?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}

export class MemberService {
  constructor(private readonly repository: MemberRepository) {}

  async list() {
    const members = await this.repository.findAll();
    return members.map(mapMember);
  }

  async getById(id: string) {
    const member = await this.repository.findById(id);
    if (!member) throw new MemberNotFoundError();
    return mapMember(member);
  }

  async create(payload: MemberPayload) {
    try {
      return mapMember(await this.repository.create(payload));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MemberDocumentConflictError();
      }
      throw error;
    }
  }

  async update(id: string, payload: MemberPayload) {
    await this.assertExists(id);

    try {
      return mapMember(await this.repository.update(id, payload));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MemberDocumentConflictError();
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const member = await this.repository.findById(id);
    if (!member) throw new MemberNotFoundError();
  }
}

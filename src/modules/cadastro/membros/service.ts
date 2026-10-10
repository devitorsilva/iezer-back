import { Prisma, type Person } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
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

function mapMember(member: Person) {
  return {
    ...member,
    birthDate: member.birthDate?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}

type PersonDto = ReturnType<typeof mapMember>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: PersonDto; after?: PersonDto },
): AuditEntry {
  return { organizationId, module: "PESSOAS", action, targetType: "Person", targetId, ...data };
}

export class MemberService {
  constructor(private readonly repository: MemberRepository) {}

  async list(context: RequestContext) {
    const items = await this.repository.findAll(context.readOrganizationIds);
    return items.map(mapMember);
  }

  async getById(context: RequestContext, id: string) {
    const member = await this.repository.findById(id, context.readOrganizationIds);
    if (!member) throw new MemberNotFoundError();
    return mapMember(member);
  }

  async create(context: RequestContext, payload: MemberPayload) {
    const organizationId = requireWriteOrganization(context);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const created = mapMember(await this.repository.create(payload, organizationId, tx));
        await audit(auditEntry("criar", organizationId, created.id, { after: created }));
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MemberDocumentConflictError();
      }
      throw error;
    }
  }

  async update(context: RequestContext, id: string, payload: MemberPayload) {
    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.assertExists(context, id, tx);
        const updated = mapMember(await this.repository.update(id, payload, tx));
        await audit(
          auditEntry("editar", existing.organizationId, id, { before: mapMember(existing), after: updated }),
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MemberDocumentConflictError();
      }
      throw error;
    }
  }

  async remove(context: RequestContext, id: string) {
    await runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      await this.repository.delete(id, tx);
      await audit(auditEntry("excluir", existing.organizationId, id, { before: mapMember(existing) }));
    });
  }

  private async assertExists(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const member = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!member) throw new MemberNotFoundError();
    return member;
  }
}

import { Prisma, type AgendaSpace } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { AgendaSpaceRepository } from "./repository.js";
import type { SpacePayload } from "./schemas.js";

const mapSpace = (space: AgendaSpace) => ({
  ...space,
  createdAt: space.createdAt.toISOString(),
  updatedAt: space.updatedAt.toISOString(),
});

function audit(action: string, organizationId: string, targetId: string, snapshots: object): AuditEntry {
  return { organizationId, module: "AGENDA", action, targetType: "AgendaSpace", targetId, ...snapshots };
}

function translateConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, "AGENDA_SPACE_NAME_CONFLICT", "Já existe um espaço com este nome nesta organização.", {
      field: "name",
    });
  }
  throw error;
}

export class AgendaSpaceService {
  constructor(private readonly repository: AgendaSpaceRepository) {}

  async list(context: RequestContext) {
    return (await this.repository.findAll(context.readOrganizationIds)).map(mapSpace);
  }

  async getById(context: RequestContext, id: string) {
    const space = await this.repository.findById(id, context.readOrganizationIds);
    if (!space) throw new AppError(404, "AGENDA_SPACE_NOT_FOUND", "Espaço não encontrado.");
    return mapSpace(space);
  }

  async create(context: RequestContext, payload: SpacePayload) {
    const organizationId = requireWriteOrganization(context);
    try {
      return await runAudited(context.actor, async (tx, writeAudit) => {
        const created = mapSpace(await this.repository.create(organizationId, payload, tx));
        await writeAudit(audit("criar", organizationId, created.id, { after: created }));
        return created;
      });
    } catch (error) {
      return translateConflict(error);
    }
  }

  async update(context: RequestContext, id: string, payload: SpacePayload) {
    requireWriteOrganization(context);
    try {
      return await runAudited(context.actor, async (tx, writeAudit) => {
        const existing = await this.requireSpace(context, id, tx);
        const updated = mapSpace(await this.repository.update(id, payload, tx));
        await writeAudit(audit("editar", existing.organizationId, id, { before: mapSpace(existing), after: updated }));
        return updated;
      });
    } catch (error) {
      return translateConflict(error);
    }
  }

  async remove(context: RequestContext, id: string) {
    requireWriteOrganization(context);
    return runAudited(context.actor, async (tx, writeAudit) => {
      const existing = await this.requireSpace(context, id, tx);
      const hasHistory = !shouldPhysicallyDelete(await this.repository.countReservations(id, tx));
      const result = hasHistory ? await this.repository.deactivate(id, tx) : await this.repository.delete(id, tx);
      await writeAudit(
        audit(hasHistory ? "desativar" : "excluir", existing.organizationId, id, { before: mapSpace(existing), after: hasHistory ? mapSpace(result) : undefined }),
      );
      return { deleted: !hasHistory, space: hasHistory ? mapSpace(result) : null };
    });
  }

  private async requireSpace(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const space = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!space) throw new AppError(404, "AGENDA_SPACE_NOT_FOUND", "Espaço não encontrado.");
    return space;
  }
}

export function shouldPhysicallyDelete(reservationCount: number) {
  return reservationCount === 0;
}

import { Prisma, type AgendaSpace } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import type { SpacePayload } from "./schemas.js";

type Db = Prisma.TransactionClient;

export class AgendaSpaceRepository {
  findAll(organizationIds: string[], db: Db = prisma): Promise<AgendaSpace[]> {
    return db.agendaSpace.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  findById(id: string, organizationIds: string[], db: Db = prisma): Promise<AgendaSpace | null> {
    return db.agendaSpace.findFirst({ where: { id, organizationId: { in: organizationIds } } });
  }

  create(organizationId: string, payload: SpacePayload, db: Db): Promise<AgendaSpace> {
    return db.agendaSpace.create({ data: { organizationId, ...payload } });
  }

  update(id: string, payload: SpacePayload, db: Db): Promise<AgendaSpace> {
    return db.agendaSpace.update({ where: { id }, data: payload });
  }

  countReservations(id: string, db: Db): Promise<number> {
    return db.agendaReservation.count({ where: { spaceId: id } });
  }

  delete(id: string, db: Db): Promise<AgendaSpace> {
    return db.agendaSpace.delete({ where: { id } });
  }

  deactivate(id: string, db: Db): Promise<AgendaSpace> {
    return db.agendaSpace.update({ where: { id }, data: { isActive: false } });
  }
}

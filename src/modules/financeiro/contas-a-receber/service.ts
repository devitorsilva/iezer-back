import type { ReceivableWithCategory, ReceivableRepository } from "./repository.js";
import type { ReceivablePayload, ReceivableQuery } from "./schemas.js";

export class ReceivableNotFoundError extends Error {
  constructor() {
    super("RECEIVABLE_NOT_FOUND");
  }
}

function mapReceivable(receivable: ReceivableWithCategory) {
  return {
    id: receivable.id,
    description: receivable.description,
    source: receivable.source,
    memberId: receivable.memberId,
    memberName: receivable.member?.name ?? null,
    categoryId: receivable.categoryId,
    categoryName: receivable.category?.name ?? null,
    dueDate: receivable.dueDate.toISOString(),
    amount: receivable.amount.toNumber(),
    status: receivable.status,
    notes: receivable.notes,
    createdAt: receivable.createdAt.toISOString(),
    updatedAt: receivable.updatedAt.toISOString(),
  };
}

export class ReceivableService {
  constructor(private readonly repository: ReceivableRepository) {}

  async list(query: ReceivableQuery) {
    const items = await this.repository.findAll(query);
    return items.map(mapReceivable);
  }

  async create(payload: ReceivablePayload) {
    return mapReceivable(await this.repository.create(payload));
  }

  async update(id: string, payload: ReceivablePayload) {
    await this.assertExists(id);
    return mapReceivable(await this.repository.update(id, payload));
  }

  async settle(id: string) {
    await this.assertExists(id);
    return mapReceivable(await this.repository.settle(id));
  }

  async remove(id: string) {
    await this.assertExists(id);
    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const receivable = await this.repository.findById(id);
    if (!receivable) throw new ReceivableNotFoundError();
  }
}

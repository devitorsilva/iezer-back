import { randomUUID } from "node:crypto";
import type { PayableCreatePayload, PayableWithCategory, PayableRepository } from "./repository.js";
import type { PayablePayload, PayableQuery } from "./schemas.js";

export class PayableNotFoundError extends Error {
  constructor() {
    super("PAYABLE_NOT_FOUND");
  }
}

function mapPayable(payable: PayableWithCategory) {
  return {
    id: payable.id,
    description: payable.description,
    supplierId: payable.supplierId,
    supplierName: payable.supplier?.name ?? null,
    categoryId: payable.categoryId,
    categoryName: payable.category?.name ?? null,
    dueDate: payable.dueDate.toISOString(),
    amount: payable.amount.toNumber(),
    status: payable.status,
    isRecurring: payable.isRecurring,
    recurrenceFrequency: payable.recurrenceFrequency,
    recurrenceCount: payable.recurrenceCount,
    recurrenceGroupId: payable.recurrenceGroupId,
    notes: payable.notes,
    createdAt: payable.createdAt.toISOString(),
    updatedAt: payable.updatedAt.toISOString(),
  };
}

function cloneDate(date: Date) {
  return new Date(date.getTime());
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addMonths(date: Date, months: number) {
  const next = cloneDate(date);
  const originalDay = next.getUTCDate();
  const targetMonth = next.getUTCMonth() + months;
  next.setUTCDate(1);
  next.setUTCMonth(targetMonth);
  next.setUTCDate(Math.min(originalDay, daysInMonth(next.getUTCFullYear(), next.getUTCMonth())));
  return next;
}

function addYears(date: Date, years: number) {
  return addMonths(date, years * 12);
}

function addDays(date: Date, days: number) {
  const next = cloneDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextDueDate(baseDate: Date, frequency: NonNullable<PayablePayload["recurrenceFrequency"]>, index: number) {
  if (frequency === "QUINZENAL") return addDays(baseDate, index * 15);
  if (frequency === "ANUAL") return addYears(baseDate, index);
  return addMonths(baseDate, index);
}

function buildRecurringPayloads(payload: PayablePayload): PayableCreatePayload[] {
  const recurrenceCount = payload.isRecurring ? payload.recurrenceCount ?? 1 : 1;
  const recurrenceFrequency = payload.recurrenceFrequency ?? "MENSAL";
  const recurrenceGroupId = recurrenceCount > 1 ? randomUUID() : undefined;

  return Array.from({ length: recurrenceCount }, (_, index) => ({
    ...payload,
    dueDate: nextDueDate(payload.dueDate, recurrenceFrequency, index),
    isRecurring: recurrenceCount > 1,
    recurrenceFrequency: recurrenceCount > 1 ? recurrenceFrequency : undefined,
    recurrenceCount: recurrenceCount > 1 ? recurrenceCount : undefined,
    recurrenceGroupId,
  }));
}

export class PayableService {
  constructor(private readonly repository: PayableRepository) {}

  async list(query: PayableQuery) {
    const items = await this.repository.findAll(query);
    return items.map(mapPayable);
  }

  async create(payload: PayablePayload) {
    const payloads = buildRecurringPayloads(payload);
    if (payloads.length === 1) {
      return { items: [mapPayable(await this.repository.create(payloads[0]))] };
    }

    const result = await this.repository.createMany(payloads);
    return { items: [], count: result.count };
  }

  async update(id: string, payload: PayablePayload) {
    await this.assertExists(id);
    return mapPayable(await this.repository.update(id, payload));
  }

  async settle(id: string) {
    await this.assertExists(id);
    return mapPayable(await this.repository.settle(id));
  }

  async remove(id: string, scope: "single" | "series" = "single") {
    const payable = await this.assertExists(id);

    if (scope === "series" && payable.recurrenceGroupId) {
      await this.repository.deleteByRecurrenceGroupId(payable.recurrenceGroupId);
      return;
    }

    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const payable = await this.repository.findById(id);
    if (!payable) throw new PayableNotFoundError();
    return payable;
  }
}

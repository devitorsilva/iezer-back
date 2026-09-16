import { randomUUID } from "node:crypto";
import type { ReceivableCreatePayload, ReceivableWithCategory, ReceivableRepository } from "./repository.js";
import type { ReceivablePayload, ReceivableQuery, ReceivableSettlementPayload } from "./schemas.js";

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
    settledAmount: receivable.settledAmount?.toNumber() ?? null,
    settledAt: receivable.settledAt?.toISOString() ?? null,
    settlementMethod: receivable.settlementMethod,
    settlementBankAccountId: receivable.settlementBankAccountId,
    settlementBankAccountName: receivable.settlementBankAccount
      ? `${receivable.settlementBankAccount.bankName} • ${receivable.settlementBankAccount.accountName}`
      : null,
    isRecurring: receivable.isRecurring,
    recurrenceFrequency: receivable.recurrenceFrequency,
    recurrenceCount: receivable.recurrenceCount,
    recurrenceGroupId: receivable.recurrenceGroupId,
    notes: receivable.notes,
    createdAt: receivable.createdAt.toISOString(),
    updatedAt: receivable.updatedAt.toISOString(),
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

function nextDueDate(
  baseDate: Date,
  frequency: NonNullable<ReceivablePayload["recurrenceFrequency"]>,
  index: number,
) {
  if (frequency === "QUINZENAL") return addDays(baseDate, index * 15);
  if (frequency === "ANUAL") return addYears(baseDate, index);
  return addMonths(baseDate, index);
}

function buildRecurringPayloads(payload: ReceivablePayload): ReceivableCreatePayload[] {
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

export class ReceivableService {
  constructor(private readonly repository: ReceivableRepository) {}

  async list(query: ReceivableQuery) {
    const items = await this.repository.findAll(query);
    return items.map(mapReceivable);
  }

  async create(payload: ReceivablePayload) {
    const payloads = buildRecurringPayloads(payload);
    if (payloads.length === 1) {
      return { items: [mapReceivable(await this.repository.create(payloads[0]))] };
    }

    const result = await this.repository.createMany(payloads);
    return { items: [], count: result.count };
  }

  async update(id: string, payload: ReceivablePayload) {
    await this.assertExists(id);
    return mapReceivable(await this.repository.update(id, payload));
  }

  async settle(id: string, payload: ReceivableSettlementPayload = {}) {
    const receivable = await this.assertExists(id);
    return mapReceivable(
      await this.repository.settle(id, {
        settledAmount: payload.settledAmount ?? receivable.amount.toNumber(),
        settledAt: payload.settledAt ?? new Date(),
        settlementMethod: payload.settlementMethod,
        settlementBankAccountId: payload.settlementBankAccountId,
      }),
    );
  }

  async remove(id: string, scope: "single" | "series" = "single") {
    const receivable = await this.assertExists(id);

    if (scope === "series" && receivable.recurrenceGroupId) {
      await this.repository.deleteByRecurrenceGroupId(receivable.recurrenceGroupId);
      return;
    }

    await this.repository.delete(id);
  }

  private async assertExists(id: string) {
    const receivable = await this.repository.findById(id);
    if (!receivable) throw new ReceivableNotFoundError();
    return receivable;
  }
}

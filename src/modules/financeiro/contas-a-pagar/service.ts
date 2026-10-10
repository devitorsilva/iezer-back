import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { assertReferencesInOrganization } from "../../../lib/organization.js";
import type { PayableCreatePayload, PayableWithCategory, PayableRepository } from "./repository.js";
import type { PayablePayload, PayableQuery, PayableSettlementPayload } from "./schemas.js";

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
    settledAmount: payable.settledAmount?.toNumber() ?? null,
    settledAt: payable.settledAt?.toISOString() ?? null,
    settlementMethod: payable.settlementMethod,
    settlementBankAccountId: payable.settlementBankAccountId,
    settlementBankAccountName: payable.settlementBankAccount
      ? `${payable.settlementBankAccount.bankName} • ${payable.settlementBankAccount.accountName}`
      : null,
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

type PayableDto = ReturnType<typeof mapPayable>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: PayableDto; after?: PayableDto },
): AuditEntry {
  return { organizationId, module: "FINANCEIRO", action, targetType: "Payable", targetId, ...data };
}

export class PayableService {
  constructor(private readonly repository: PayableRepository) {}

  async list(context: RequestContext, query: PayableQuery) {
    const items = await this.repository.findAll(context.readOrganizationIds, query);
    return items.map(mapPayable);
  }

  async create(context: RequestContext, payload: PayablePayload) {
    const organizationId = requireWriteOrganization(context);
    const payloads = buildRecurringPayloads(payload);

    return runAudited(context.actor, async (tx, audit) => {
      await assertReferencesInOrganization(tx, organizationId, {
        supplierId: payload.supplierId,
        categoryId: payload.categoryId,
      });

      if (payloads.length === 1) {
        const created = mapPayable(await this.repository.create(payloads[0], organizationId, tx));
        await audit(auditEntry("criar", organizationId, created.id, { after: created }));
        return { items: [created] };
      }

      const created = (await this.repository.createMany(payloads, organizationId, tx)).map(mapPayable);
      await audit(created.map((item) => auditEntry("criar", organizationId, item.id, { after: item })));
      return { items: [], count: created.length };
    });
  }

  async update(context: RequestContext, id: string, payload: PayablePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      await assertReferencesInOrganization(tx, existing.organizationId, {
        supplierId: payload.supplierId,
        categoryId: payload.categoryId,
      });

      const updated = mapPayable(await this.repository.update(id, payload, tx));
      await audit(auditEntry("editar", existing.organizationId, id, { before: mapPayable(existing), after: updated }));
      return updated;
    });
  }

  async settle(context: RequestContext, id: string, payload: PayableSettlementPayload = {}) {
    return runAudited(context.actor, async (tx, audit) => {
      const payable = await this.assertExists(context, id, tx);
      await assertReferencesInOrganization(tx, payable.organizationId, {
        bankAccountId: payload.settlementBankAccountId,
      });

      const settled = mapPayable(
        await this.repository.settle(
          id,
          {
            settledAmount: payload.settledAmount ?? payable.amount.toNumber(),
            settledAt: payload.settledAt ?? new Date(),
            settlementMethod: payload.settlementMethod,
            settlementBankAccountId: payload.settlementBankAccountId,
          },
          tx,
        ),
      );
      await audit(auditEntry("baixar", payable.organizationId, id, { before: mapPayable(payable), after: settled }));
      return settled;
    });
  }

  async remove(context: RequestContext, id: string, scope: "single" | "series" = "single") {
    await runAudited(context.actor, async (tx, audit) => {
      const payable = await this.assertExists(context, id, tx);

      if (scope === "series" && payable.recurrenceGroupId) {
        const series = await this.repository.findByRecurrenceGroupId(
          payable.recurrenceGroupId,
          payable.organizationId,
          tx,
        );
        await this.repository.deleteByRecurrenceGroupId(payable.recurrenceGroupId, payable.organizationId, tx);
        await audit(
          series.map((item) =>
            auditEntry("excluir", item.organizationId, item.id, { before: mapPayable(item) }),
          ),
        );
        return;
      }

      await this.repository.delete(id, tx);
      await audit(auditEntry("excluir", payable.organizationId, id, { before: mapPayable(payable) }));
    });
  }

  private async assertExists(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const payable = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!payable) throw new PayableNotFoundError();
    return payable;
  }
}

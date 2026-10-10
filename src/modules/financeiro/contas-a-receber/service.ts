import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { assertReferencesInOrganization } from "../../../lib/organization.js";
import type { ReceivableCreatePayload, ReceivableWithCategory, ReceivableRepository } from "./repository.js";
import type { ReceivablePayload, ReceivableQuery, ReceivableSettlementPayload } from "./schemas.js";

export class ReceivableNotFoundError extends Error {
  constructor() {
    super("RECEIVABLE_NOT_FOUND");
  }
}

// O nome da pessoa só aparece para quem também tem "Ver pessoas" (PRD Acesso › Catálogo do Financeiro).
function mapReceivable(receivable: ReceivableWithCategory, showPerson = true) {
  return {
    id: receivable.id,
    description: receivable.description,
    source: receivable.source,
    memberId: receivable.personId,
    memberName: showPerson ? (receivable.person?.name ?? null) : null,
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

type ReceivableDto = ReturnType<typeof mapReceivable>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: ReceivableDto; after?: ReceivableDto },
): AuditEntry {
  return { organizationId, module: "FINANCEIRO", action, targetType: "Receivable", targetId, ...data };
}

export class ReceivableService {
  constructor(private readonly repository: ReceivableRepository) {}

  async list(context: RequestContext, query: ReceivableQuery) {
    const items = await this.repository.findAll(context.readOrganizationIds, query);
    const showPerson = context.permissions.has("pessoas.ver");
    return items.map((item) => mapReceivable(item, showPerson));
  }

  async create(context: RequestContext, payload: ReceivablePayload) {
    const organizationId = requireWriteOrganization(context);
    const payloads = buildRecurringPayloads(payload);
    const showPerson = context.permissions.has("pessoas.ver");

    return runAudited(context.actor, async (tx, audit) => {
      await assertReferencesInOrganization(tx, organizationId, {
        personId: payload.memberId,
        categoryId: payload.categoryId,
      });

      if (payloads.length === 1) {
        const created = await this.repository.create(payloads[0], organizationId, tx);
        await audit(auditEntry("criar", organizationId, created.id, { after: mapReceivable(created) }));
        return { items: [mapReceivable(created, showPerson)] };
      }

      const created = await this.repository.createMany(payloads, organizationId, tx);
      await audit(created.map((item) => auditEntry("criar", organizationId, item.id, { after: mapReceivable(item) })));
      return { items: [], count: created.length };
    });
  }

  async update(context: RequestContext, id: string, payload: ReceivablePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertExists(context, id, tx);
      await assertReferencesInOrganization(tx, existing.organizationId, {
        personId: payload.memberId,
        categoryId: payload.categoryId,
      });

      const updated = await this.repository.update(id, payload, tx);
      await audit(
        auditEntry("editar", existing.organizationId, id, {
          before: mapReceivable(existing),
          after: mapReceivable(updated),
        }),
      );
      return mapReceivable(updated, context.permissions.has("pessoas.ver"));
    });
  }

  async settle(context: RequestContext, id: string, payload: ReceivableSettlementPayload = {}) {
    return runAudited(context.actor, async (tx, audit) => {
      const receivable = await this.assertExists(context, id, tx);
      await assertReferencesInOrganization(tx, receivable.organizationId, {
        bankAccountId: payload.settlementBankAccountId,
      });

      const settled = await this.repository.settle(
        id,
        {
          settledAmount: payload.settledAmount ?? receivable.amount.toNumber(),
          settledAt: payload.settledAt ?? new Date(),
          settlementMethod: payload.settlementMethod,
          settlementBankAccountId: payload.settlementBankAccountId,
        },
        tx,
      );
      await audit(
        auditEntry("baixar", receivable.organizationId, id, {
          before: mapReceivable(receivable),
          after: mapReceivable(settled),
        }),
      );
      return mapReceivable(settled, context.permissions.has("pessoas.ver"));
    });
  }

  async remove(context: RequestContext, id: string, scope: "single" | "series" = "single") {
    await runAudited(context.actor, async (tx, audit) => {
      const receivable = await this.assertExists(context, id, tx);

      if (scope === "series" && receivable.recurrenceGroupId) {
        const series = await this.repository.findByRecurrenceGroupId(
          receivable.recurrenceGroupId,
          receivable.organizationId,
          tx,
        );
        await this.repository.deleteByRecurrenceGroupId(receivable.recurrenceGroupId, receivable.organizationId, tx);
        await audit(
          series.map((item) =>
            auditEntry("excluir", item.organizationId, item.id, { before: mapReceivable(item) }),
          ),
        );
        return;
      }

      await this.repository.delete(id, tx);
      await audit(auditEntry("excluir", receivable.organizationId, id, { before: mapReceivable(receivable) }));
    });
  }

  private async assertExists(context: RequestContext, id: string, tx: Prisma.TransactionClient) {
    const receivable = await this.repository.findById(id, context.readOrganizationIds, tx);
    if (!receivable) throw new ReceivableNotFoundError();
    return receivable;
  }
}

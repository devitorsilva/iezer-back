import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

export interface PanelBounds {
  today: Date;
  dueSoonEnd: Date;
  periodStart: Date;
  periodEnd: Date;
}

type Amount = Prisma.Decimal | number | string;

export interface PanelRow {
  payOverdueCount: number;
  payOverdueAmount: Amount;
  payDueSoonCount: number;
  payDueSoonAmount: Amount;
  payPeriodAmount: Amount;
  paySettledAmount: Amount;
  payWithoutAccountAmount: Amount;
  recOverdueCount: number;
  recOverdueAmount: Amount;
  recDueSoonCount: number;
  recDueSoonAmount: Amount;
  recPeriodAmount: Amount;
  recSettledAmount: Amount;
  recWithoutAccountAmount: Amount;
  accounts: number;
  openingBalance: Amount;
}

// Agregados de uma tabela de contas (a pagar ou a receber). Vencida = em aberto com vencimento antes
// de hoje; a baixa vale o valor baixado (ou o da conta, nas antigas sem ele).
function accountTotals(table: "Payable" | "Receivable", settled: "PAGO" | "RECEBIDO", prefix: string, ids: Prisma.Sql, b: PanelBounds) {
  const col = (name: string) => Prisma.raw(`"${prefix}${name}"`);
  const value = Prisma.sql`COALESCE("settledAmount", "amount")`;
  return Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE "status"::text <> ${settled} AND "dueDate" < ${b.today})::int AS ${col("OverdueCount")},
      COALESCE(SUM("amount") FILTER (WHERE "status"::text <> ${settled} AND "dueDate" < ${b.today}), 0) AS ${col("OverdueAmount")},
      COUNT(*) FILTER (WHERE "status"::text <> ${settled} AND "dueDate" >= ${b.today} AND "dueDate" < ${b.dueSoonEnd})::int AS ${col("DueSoonCount")},
      COALESCE(SUM("amount") FILTER (WHERE "status"::text <> ${settled} AND "dueDate" >= ${b.today} AND "dueDate" < ${b.dueSoonEnd}), 0) AS ${col("DueSoonAmount")},
      COALESCE(SUM(${value}) FILTER (WHERE "status"::text = ${settled} AND "settledAt" >= ${b.periodStart} AND "settledAt" < ${b.periodEnd}), 0) AS ${col("PeriodAmount")},
      COALESCE(SUM(${value}) FILTER (WHERE "status"::text = ${settled}), 0) AS ${col("SettledAmount")},
      COALESCE(SUM(${value}) FILTER (WHERE "status"::text = ${settled} AND "settlementBankAccountId" IS NULL), 0) AS ${col("WithoutAccountAmount")}
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "organizationId" IN (${ids})`;
}

export class FinancePanelRepository {
  // Uma consulta só (cada ida ao pooler custa caro): contas a pagar, a receber e contas bancárias,
  // inclusive as inativas, das organizações lidas.
  async totals(organizationIds: string[], bounds: PanelBounds) {
    const ids = Prisma.join(organizationIds);
    const [row] = await prisma.$queryRaw<PanelRow[]>`
      SELECT p.*, r.*, b.*
      FROM (${accountTotals("Payable", "PAGO", "pay", ids, bounds)}) p,
        (${accountTotals("Receivable", "RECEBIDO", "rec", ids, bounds)}) r,
        (
          SELECT COUNT(*)::int AS "accounts", COALESCE(SUM("openingBalance"), 0) AS "openingBalance"
          FROM "BankAccount" WHERE "organizationId" IN (${ids})
        ) b`;
    return row;
  }
}

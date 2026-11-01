import type { RequestContext } from "../../../lib/access.js";
import { addDays, formatCivilDate, parseCivilDate, todayCivil } from "../../../lib/civil-date.js";
import { FinancePanelRepository, type PanelBounds, type PanelRow } from "./repository.js";
import type { FinancePanelPeriod } from "./schemas.js";

// "A vencer em 7 dias": de hoje até hoje + 7, inclusive.
const DUE_SOON_DAYS = 7;

// Vencimentos e baixas são gravados como meia-noite UTC da data civil, então os limites também são.
function bounds(period: FinancePanelPeriod, today = todayCivil()): PanelBounds {
  const start = parseCivilDate(today);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const [periodStart, periodEnd] =
    period === "hoje"
      ? [start, addDays(start, 1)]
      : period === "mes"
        ? [new Date(Date.UTC(year, month, 1)), new Date(Date.UTC(year, month + 1, 1))]
        : [new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))];
  return { today: start, dueSoonEnd: addDays(start, DUE_SOON_DAYS + 1), periodStart, periodEnd };
}

const money = (value: PanelRow["openingBalance"]) => Number(value);

// Cartões financeiros do Painel do app das igrejas. Cada parte só sai com a permissão de ver aquela
// lista (null esconde o cartão); o saldo junta as duas, então exige ambas.
export class FinancePanelService {
  constructor(private readonly repository: FinancePanelRepository) {}

  async get(context: RequestContext, period: FinancePanelPeriod) {
    const b = bounds(period);
    const row = await this.repository.totals(context.readOrganizationIds, b);
    const canPay = context.permissions.has("financeiro.pagar.ver");
    const canReceive = context.permissions.has("financeiro.receber.ver");

    return {
      period: {
        key: period,
        start: formatCivilDate(b.periodStart),
        end: formatCivilDate(addDays(b.periodEnd, -1)),
      },
      payables: canPay
        ? {
            overdue: { count: row.payOverdueCount, amount: money(row.payOverdueAmount) },
            dueSoon: { count: row.payDueSoonCount, amount: money(row.payDueSoonAmount) },
            settledInPeriod: money(row.payPeriodAmount),
          }
        : null,
      receivables: canReceive
        ? {
            overdue: { count: row.recOverdueCount, amount: money(row.recOverdueAmount) },
            dueSoon: { count: row.recDueSoonCount, amount: money(row.recDueSoonAmount) },
            settledInPeriod: money(row.recPeriodAmount),
          }
        : null,
      balance:
        canPay && canReceive
          ? {
              amount: money(row.openingBalance) + money(row.recSettledAmount) - money(row.paySettledAmount),
              accounts: row.accounts,
              // Baixas sem conta bancária informada (entram no saldo; o cartão avisa quando ≠ 0).
              withoutAccount: money(row.recWithoutAccountAmount) - money(row.payWithoutAccountAmount),
            }
          : null,
    };
  }
}

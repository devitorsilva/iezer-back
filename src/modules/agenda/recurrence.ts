import rrule from "rrule";

const { datetime, RRule } = rrule;

export type AgendaRecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type AgendaWeekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface AgendaRecurrenceInput {
  startsAtLocal: string;
  timezone: string;
  frequency: AgendaRecurrenceFrequency;
  interval?: number;
  weekdays?: AgendaWeekday[];
  count?: number;
  endsAtLocal?: string;
}

export interface RecurrenceWindow {
  from?: Date;
  until: Date;
}

const FREQUENCIES: Record<AgendaRecurrenceFrequency, number> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

const WEEKDAYS = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
} satisfies Record<AgendaWeekday, (typeof RRule)["MO"]>;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function asRRuleDate(value: string) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new Error("Data local invalida; use YYYY-MM-DDTHH:mm:ss");

  const [, year, month, day, hour, minute, second = "0"] = match;
  return datetime(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second));
}

function assertTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error(`Timezone IANA invalido: ${timezone}`);
  }
}

function zonedLocalToUtc(localDate: Date, timezone: string) {
  const expected = localDate.getTime();
  let candidate = expected;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const difference = expected - represented;
    if (difference === 0) break;
    candidate += difference;
  }

  return new Date(candidate);
}

export function expandRecurrence(input: AgendaRecurrenceInput, window?: RecurrenceWindow): Date[] {
  assertTimezone(input.timezone);

  const interval = input.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1) throw new Error("Intervalo deve ser um inteiro positivo");
  if (input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1)) {
    throw new Error("Quantidade deve ser um inteiro positivo");
  }
  if (input.frequency === "WEEKLY" && (!input.weekdays || input.weekdays.length === 0)) {
    throw new Error("Recorrencia semanal exige ao menos um dia da semana");
  }
  if (!input.count && !input.endsAtLocal && !window) {
    throw new Error("Recorrencia sem termino exige uma janela de materializacao");
  }

  const rule = new RRule({
    freq: FREQUENCIES[input.frequency],
    dtstart: asRRuleDate(input.startsAtLocal),
    interval,
    count: input.count,
    until: input.endsAtLocal ? asRRuleDate(input.endsAtLocal) : undefined,
    byweekday: input.weekdays?.map((weekday) => WEEKDAYS[weekday]),
  });

  const toUtc = (date: Date) => zonedLocalToUtc(date, input.timezone);
  if (!window) return rule.all().map(toUtc);

  const dates = rule.all((date) => toUtc(date) <= window.until).map(toUtc);
  const from = window.from ?? new Date(0);
  return dates.filter((date) => date >= from && date <= window.until);
}

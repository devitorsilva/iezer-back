import { AppError } from "../../../lib/errors.js";

export const MATERIALIZATION_MONTHS = 12;

export function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function uniquePeople<T extends { personId: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.personId, item])).values()];
}

export function isMaterialChange(input: Record<string, unknown>) {
  return ["startsAt", "endsAt", "locationType", "externalLocationName", "externalAddress", "spaceIds"].some((key) => key in input);
}

export function agendaVisibility(
  role: "MANAGER" | "LEADER" | "PARTICIPANT" | "SUMMARY",
  visibility: "SOMENTE_LIDERES" | "NOMES" | "NOMES_E_RESPOSTAS",
) {
  const showManagementData = role === "MANAGER" || role === "LEADER";
  return {
    showNames: showManagementData || visibility !== "SOMENTE_LIDERES",
    showResponses: showManagementData || visibility === "NOMES_E_RESPOSTAS",
    showManagementData,
  };
}

function localDateTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}`;
}

export function recurrenceWithStart(rrule: string, startsAt: Date, timezone: string) {
  const recurrence = JSON.parse(rrule) as Record<string, unknown>;
  return JSON.stringify({ ...recurrence, startsAtLocal: localDateTime(startsAt, timezone) });
}

export function reservationSpacePlan(current: string[], requested: string[] | undefined, locationType: "INTERNO" | "EXTERNO") {
  const currentIds = [...new Set(current)];
  const targetIds = locationType === "EXTERNO" ? [] : requested === undefined ? currentIds : [...new Set(requested)];
  const currentSet = new Set(currentIds);
  const targetSet = new Set(targetIds);
  return {
    keep: targetIds.filter((id) => currentSet.has(id)),
    add: targetIds.filter((id) => !currentSet.has(id)),
    release: currentIds.filter((id) => !targetSet.has(id)),
  };
}

export function addedParticipantIds(before: string[], after: string[]) {
  const existing = new Set(before);
  return [...new Set(after)].filter((id) => !existing.has(id));
}

export function participantNotificationIds<T extends { personId: string; type: string }>(before: T[], after: T[]) {
  const previous = new Map(before.map((item) => [item.personId, item.type]));
  return uniquePeople(after)
    .filter((item) => previous.get(item.personId) !== item.type)
    .map((item) => item.personId);
}

export function reminderPlan(current: number[], requested: number[]) {
  const currentValues = [...new Set(current)];
  const requestedValues = [...new Set(requested)];
  const currentSet = new Set(currentValues);
  const requestedSet = new Set(requestedValues);
  return {
    keep: requestedValues.filter((value) => currentSet.has(value)),
    add: requestedValues.filter((value) => !currentSet.has(value)),
    remove: currentValues.filter((value) => !requestedSet.has(value)),
  };
}

export function assertCompletableStatus(status: string) {
  if (status !== "PUBLICADO") {
    throw new AppError(409, "EVENT_NOT_PUBLISHED", "Somente eventos publicados podem ser concluídos.");
  }
}

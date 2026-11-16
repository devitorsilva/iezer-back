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

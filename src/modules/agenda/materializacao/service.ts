import { Prisma, type AgendaEventSeries } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { addUtcMonths } from "../eventos/helpers.js";
import { expandRecurrence, type AgendaRecurrenceInput } from "../recurrence.js";

export type AgendaMaterializationDb = Prisma.TransactionClient;

export interface MaterializationOptions {
  now?: Date;
  horizon?: Date;
  from?: Date;
  replaceFrom?: Date;
  spaceIds?: string[];
}

interface MaterializedSeries extends AgendaEventSeries {
  participants: Array<{ personId: string }>;
  occurrences: Array<{
    id: string;
    sequence: number;
    originalStartsAt: Date;
    startsAt: Date;
    reservations: Array<{
      spaceId: string;
      status: "ATIVA" | "LIBERADA" | "CANCELADA";
      space: { preparationMinutes: number; cleanupMinutes: number };
    }>;
  }>;
}

export function materializationHorizon(now: Date) {
  return addUtcMonths(now, 12);
}

export function missingMaterializationDates(
  recurrence: AgendaRecurrenceInput,
  existingDates: Date[],
  from: Date,
  horizon: Date,
) {
  const existing = new Set(existingDates.map((date) => date.getTime()));
  return expandRecurrence(recurrence, { from, until: horizon }).filter((date) => !existing.has(date.getTime()));
}

export function truncateRecurrenceBefore(rrule: string, pivot: Date, timezone: string) {
  const recurrence = JSON.parse(rrule) as Omit<AgendaRecurrenceInput, "timezone">;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const localEnd = formatter.format(new Date(pivot.getTime() - 1_000)).replace(" ", "T");
  return JSON.stringify({ ...recurrence, count: undefined, endsAtLocal: localEnd });
}

export async function lockAgendaSeries(db: Pick<AgendaMaterializationDb, "$queryRaw">, seriesId: string) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${seriesId}))`;
}

function parseRecurrence(series: AgendaEventSeries) {
  if (!series.rrule) return null;
  return { ...(JSON.parse(series.rrule) as Omit<AgendaRecurrenceInput, "timezone">), timezone: series.timezone };
}

function activeSpaceIds(series: MaterializedSeries) {
  if (series.locationType !== "INTERNO") return [];
  const template = [...series.occurrences]
    .sort((left, right) => right.startsAt.getTime() - left.startsAt.getTime())
    .find((occurrence) => occurrence.reservations.some((reservation) => reservation.status === "ATIVA"));
  return [...new Set(template?.reservations.filter((reservation) => reservation.status === "ATIVA").map((reservation) => reservation.spaceId) ?? [])];
}

async function loadSeries(db: AgendaMaterializationDb, seriesId: string): Promise<MaterializedSeries | null> {
  return db.agendaEventSeries.findUnique({
    where: { id: seriesId },
    include: {
      participants: { select: { personId: true } },
      occurrences: {
        select: {
          id: true,
          sequence: true,
          originalStartsAt: true,
          startsAt: true,
          reservations: {
            select: {
              spaceId: true,
              status: true,
              space: { select: { preparationMinutes: true, cleanupMinutes: true } },
            },
          },
        },
      },
    },
  }) as Promise<MaterializedSeries | null>;
}

export async function materializeAgendaSeries(
  db: AgendaMaterializationDb,
  seriesId: string,
  options: MaterializationOptions = {},
) {
  await lockAgendaSeries(db, seriesId);
  let series = await loadSeries(db, seriesId);
  if (!series?.rrule || series.status === "CANCELADO" || series.status === "CONCLUIDO") {
    return { created: 0, horizon: series?.occurrenceHorizonAt ?? null };
  }

  const recurrence = parseRecurrence(series)!;
  const now = options.now ?? new Date();
  const horizon = options.horizon ?? materializationHorizon(now);
  const duration = series.endsAt.getTime() - series.startsAt.getTime();
  const selectedSpaceIds = options.spaceIds ?? activeSpaceIds(series);

  if (options.replaceFrom) {
    const replaceIds = series.occurrences
      .filter((occurrence) => occurrence.startsAt >= options.replaceFrom!)
      .map((occurrence) => occurrence.id);
    if (replaceIds.length) {
      await db.agendaReservation.deleteMany({ where: { occurrenceId: { in: replaceIds } } });
      await db.agendaOccurrence.deleteMany({ where: { id: { in: replaceIds } } });
      series = (await loadSeries(db, seriesId))!;
    }
  }

  const from = options.from ?? (now > series.startsAt ? now : series.startsAt);
  const dates = missingMaterializationDates(
    recurrence,
    series.occurrences.map((occurrence) => occurrence.originalStartsAt),
    from,
    horizon,
  );
  let sequence = series.occurrences.reduce((maximum, occurrence) => Math.max(maximum, occurrence.sequence), 0);
  const spaces = selectedSpaceIds.length
    ? await db.agendaSpace.findMany({
        where: { id: { in: selectedSpaceIds }, organizationId: series.organizationId, isActive: true },
        select: { id: true, preparationMinutes: true, cleanupMinutes: true },
      })
    : [];

  for (const startsAt of dates) {
    const occurrence = await db.agendaOccurrence.create({
      data: {
        seriesId,
        sequence: ++sequence,
        originalStartsAt: startsAt,
        startsAt,
        endsAt: new Date(startsAt.getTime() + duration),
        externalLocationName: series.externalLocationName,
        externalAddress: series.externalAddress,
      },
    });
    if (series.participants.length) {
      await db.agendaOccurrenceResponse.createMany({
        data: series.participants.map(({ personId }) => ({ occurrenceId: occurrence.id, personId })),
      });
    }
    if (spaces.length) {
      await db.agendaReservation.createMany({
        data: spaces.map((space) => ({
          organizationId: series!.organizationId,
          spaceId: space.id,
          occurrenceId: occurrence.id,
          kind: "EVENTO",
          startsAt,
          endsAt: occurrence.endsAt,
          effectiveStartsAt: new Date(startsAt.getTime() - space.preparationMinutes * 60_000),
          effectiveEndsAt: new Date(occurrence.endsAt.getTime() + space.cleanupMinutes * 60_000),
          createdById: series!.createdById,
        })),
      });
    }
  }

  const finiteDates = recurrence.count || recurrence.endsAtLocal ? expandRecurrence(recurrence) : null;
  await db.agendaEventSeries.update({
    where: { id: seriesId },
    data: {
      occurrenceHorizonAt: horizon,
      recurrenceUntil: finiteDates?.at(-1) ?? undefined,
    },
  });
  return { created: dates.length, horizon };
}

export async function materializeAgendaSeriesInTransaction(seriesId: string, options: MaterializationOptions = {}) {
  return prisma.$transaction((tx) => materializeAgendaSeries(tx, seriesId, options));
}

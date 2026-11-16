import { prisma } from "../../../lib/prisma.js";
import { materializationHorizon, materializeAgendaSeriesInTransaction } from "./service.js";

const DISPATCH_INTERVAL_MS = 6 * 60 * 60 * 1_000;
let running = false;

export async function dispatchAgendaMaterialization(now = new Date()) {
  if (running) return 0;
  running = true;
  try {
    const horizon = materializationHorizon(now);
    const series = await prisma.agendaEventSeries.findMany({
      where: {
        rrule: { not: null },
        status: { in: ["RASCUNHO", "PUBLICADO"] },
        OR: [{ occurrenceHorizonAt: null }, { occurrenceHorizonAt: { lt: horizon } }],
      },
      select: { id: true },
    });
    let processed = 0;
    for (const item of series) {
      try {
        await materializeAgendaSeriesInTransaction(item.id, { now, horizon });
        processed += 1;
      } catch (error) {
        console.error(`[agenda:materializacao] falha na serie ${item.id}:`, error);
      }
    }
    return processed;
  } finally {
    running = false;
  }
}

export function startAgendaMaterializationDispatcher() {
  const timer = setInterval(() => void dispatchAgendaMaterialization(), DISPATCH_INTERVAL_MS);
  timer.unref();
  return timer;
}

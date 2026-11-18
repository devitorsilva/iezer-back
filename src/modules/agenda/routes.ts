import type { FastifyPluginAsync } from "fastify";
import { agendaSpaceRoutes } from "./espacos/routes.js";
import { agendaReservationRoutes } from "./reservas/routes.js";
import { agendaEventRoutes } from "./eventos/routes.js";
import { agendaOccurrenceRoutes } from "./ocorrencias/routes.js";

export const agendaRoutes: FastifyPluginAsync = async (app) => {
  await app.register(agendaEventRoutes);
  await app.register(agendaOccurrenceRoutes);
  await app.register(agendaSpaceRoutes);
  await app.register(agendaReservationRoutes);
};

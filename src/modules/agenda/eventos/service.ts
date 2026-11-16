import type { AgendaParticipantType, Prisma } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { enqueueAgendaNotifications } from "../notificacoes/outbox.js";
import { agendaRecipientNotification, loadOccurrenceRecipients } from "../notificacoes/recipients.js";
import { materializeAgendaSeries, truncateRecurrenceBefore } from "../materializacao/service.js";
import { expandRecurrence } from "../recurrence.js";
import { isReservationConstraintError } from "../reservas/service.js";
import { addUtcMonths, isMaterialChange, uniquePeople } from "./helpers.js";
import { EventRepository, type AgendaDb, type EventDetail } from "./repository.js";
import type { CancelPayload, EventListQuery, EventPayload, EventUpdate } from "./schemas.js";

const MANAGEMENT_PERMISSIONS = new Set(["agenda.editar", "agenda.publicar", "agenda.cancelar", "agenda.convocar", "agenda.escala.gerenciar", "agenda.presenca.registrar"]);

function hasAny(context: RequestContext, permissions: string[]) {
  return permissions.some((permission) => context.permissions.has(permission as never));
}

function eventSnapshot(event: { id: string; title: string; status: string; startsAt: Date; endsAt: Date }) {
  return { id: event.id, title: event.title, status: event.status, startsAt: event.startsAt.toISOString(), endsAt: event.endsAt.toISOString() };
}

function recurrenceDates(payload: EventPayload) {
  if (!payload.recurrence) return [payload.startsAt];
  return expandRecurrence(
    { ...payload.recurrence, timezone: payload.timezone },
    { from: payload.startsAt, until: addUtcMonths(payload.startsAt, 12) },
  );
}

function rruleValue(payload: EventPayload) {
  return payload.recurrence ? JSON.stringify(payload.recurrence) : null;
}

function mapSummary(row: Awaited<ReturnType<EventRepository["list"]>>[number]) {
  const internalNames = row.reservations.map((reservation) => reservation.space.name);
  return {
    id: row.id,
    seriesId: row.seriesId,
    title: row.titleOverride ?? row.series.title,
    color: row.colorOverride ?? row.series.color,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    allDay: row.series.allDay,
    status: row.status,
    organization: row.series.organization,
    locationName: row.series.locationType === "INTERNO" ? internalNames.join(", ") || null : row.externalLocationName ?? row.series.externalLocationName,
  };
}

function mapDetail(
  event: EventDetail,
  role: "MANAGER" | "LEADER" | "PARTICIPANT" | "SUMMARY",
  currentUserId?: string | null,
  selectedOccurrenceId?: string,
  context?: RequestContext,
) {
  const manager = role === "MANAGER" || role === "LEADER";
  const showNames = manager || event.participantVisibility !== "SOMENTE_LIDERES";
  const showResponses = manager || event.participantVisibility === "NOMES_E_RESPOSTAS";
  const selectedOccurrence = event.occurrences.find((item) => item.id === selectedOccurrenceId)
    ?? event.occurrences.find((item) => item.status === "AGENDADA" && item.endsAt >= new Date())
    ?? event.occurrences[0];
  const currentPerson = event.participants.find((item) => item.person.user?.id === currentUserId);
  const currentResponse = selectedOccurrence?.responses.find((item) => item.personId === currentPerson?.personId);
  const currentScale = selectedOccurrence?.scale.find((item) => item.person.user?.id === currentUserId);
  const base = {
    id: event.id, organization: event.organization, createdBy: event.createdBy, title: event.title,
    description: event.description, color: event.color, status: event.status, allDay: event.allDay,
    timezone: event.timezone, startsAt: (selectedOccurrence?.startsAt ?? event.startsAt).toISOString(), endsAt: (selectedOccurrence?.endsAt ?? event.endsAt).toISOString(),
    locationType: event.locationType, externalLocationName: event.externalLocationName, externalAddress: event.externalAddress,
    recurrence: event.rrule ? JSON.parse(event.rrule) : null, participantVisibility: event.participantVisibility,
    occurrenceId: selectedOccurrence?.id ?? null,
    locationName: selectedOccurrence?.reservations.filter((item) => item.status === "ATIVA").map((item) => item.space.name).join(", ") || event.externalLocationName,
    spaceIds: selectedOccurrence?.reservations.filter((item) => item.status === "ATIVA").map((item) => item.spaceId) ?? [],
    scale: selectedOccurrence?.scale.map((item) => ({ id: item.personId, name: item.person.preferredName ?? item.person.name, status: item.status, accepted: item.status === "PENDENTE" ? null : item.status === "ACEITO" })) ?? [],
    attendance: selectedOccurrence?.attendances.map((item) => ({ id: item.personId, name: item.person.preferredName ?? item.person.name, status: item.status })) ?? [],
    currentUserResponse: currentResponse?.response === "PENDENTE" ? null : currentResponse?.response ?? null,
    currentUserParticipantKind: currentPerson?.type ?? null,
    currentUserPersonId: currentPerson?.personId ?? currentScale?.personId ?? null,
    currentUserIsScaled: Boolean(currentScale),
    currentUserScaleAccepted: !currentScale || currentScale.status === "PENDENTE" ? null : currentScale.status === "ACEITO",
    canManage: role === "LEADER" || Boolean(context?.permissions.has("agenda.editar")),
    canPublish: Boolean(context?.permissions.has("agenda.publicar")),
    canCancel: Boolean(context?.permissions.has("agenda.cancelar")),
    canCancelOccurrence: role === "LEADER" || Boolean(context?.permissions.has("agenda.cancelar")),
    canCancelSeries: Boolean(context?.permissions.has("agenda.cancelar")),
    canRegisterAttendance: role === "LEADER" || Boolean(context?.permissions.has("agenda.presenca.registrar")),
    reminders: event.reminders.map((item) => ({ minutesBefore: item.minutesBefore, inApp: item.inApp, email: item.email })),
    occurrences: event.occurrences.map((occurrence) => ({
      id: occurrence.id, sequence: occurrence.sequence, startsAt: occurrence.startsAt.toISOString(), endsAt: occurrence.endsAt.toISOString(), status: occurrence.status,
      title: occurrence.titleOverride ?? event.title, description: occurrence.descriptionOverride ?? event.description,
      color: occurrence.colorOverride ?? event.color,
      locationType: occurrence.locationTypeOverride ?? event.locationType,
      locationName: occurrence.externalLocationName ?? event.externalLocationName,
      address: occurrence.externalAddress ?? event.externalAddress,
      spaces: occurrence.reservations.filter((item) => item.status === "ATIVA").map((item) => item.space),
      ...(showResponses ? { responses: occurrence.responses.map((response) => ({ ...response, justification: manager ? response.justification : null })) } : {}),
      ...(manager ? { scale: occurrence.scale, attendances: occurrence.attendances } : {}),
    })),
  };
  if (role === "SUMMARY") return base;
  return {
    ...base,
    leaders: event.leaders.map(({ person }) => ({ id: person.id, name: person.preferredName ?? person.name, hasAccess: person.user?.status === "ATIVO" })),
    participants: showNames ? event.participants.map(({ person, type }) => {
      const response = selectedOccurrence?.responses.find((item) => item.personId === person.id);
      return { id: person.id, name: person.preferredName ?? person.name, type, kind: type, hasAccess: person.user?.status === "ATIVO", response: response?.response === "PENDENTE" ? null : response?.response ?? null, acknowledgedAt: response?.acknowledgedAt?.toISOString() ?? null, justification: manager ? response?.justification ?? null : null };
    }) : [],
  };
}

async function assertPeople(db: AgendaDb, organizationId: string, leaderIds: string[], participants: Array<{ personId: string; type: AgendaParticipantType }>) {
  const allIds = [...new Set([...leaderIds, ...participants.map((item) => item.personId)])];
  if (!allIds.length) return;
  const people = await db.person.findMany({ where: { id: { in: allIds }, organizationId, status: "ATIVO", bond: "MEMBRO" }, select: { id: true, user: { select: { status: true } } } });
  if (people.length !== allIds.length) throw new AppError(400, "INVALID_AGENDA_MEMBER", "Selecione somente membros ativos desta organização.");
  const validLeaders = new Set(people.filter((person) => person.user?.status === "ATIVO").map((person) => person.id));
  if (leaderIds.some((id) => !validLeaders.has(id))) throw new AppError(400, "LEADER_REQUIRES_ACCESS", "Todo líder precisa ter usuário ativo.");
}

async function reserveSpaces(db: AgendaDb, organizationId: string, occurrenceIds: Array<{ id: string; startsAt: Date; endsAt: Date }>, spaceIds: string[], createdById: string) {
  if (!spaceIds.length) return;
  const spaces = await db.agendaSpace.findMany({ where: { id: { in: spaceIds }, organizationId, isActive: true } });
  if (spaces.length !== new Set(spaceIds).size) throw new AppError(400, "INVALID_AGENDA_SPACE", "Um ou mais espaços não pertencem à organização ou estão inativos.");
  for (const occurrence of occurrenceIds) {
    await db.agendaReservation.createMany({ data: spaces.map((space) => ({ organizationId, spaceId: space.id, occurrenceId: occurrence.id, kind: "EVENTO", startsAt: occurrence.startsAt, endsAt: occurrence.endsAt, effectiveStartsAt: new Date(occurrence.startsAt.getTime() - space.preparationMinutes * 60_000), effectiveEndsAt: new Date(occurrence.endsAt.getTime() + space.cleanupMinutes * 60_000), createdById })) });
  }
}

export class EventService {
  constructor(private readonly repository = new EventRepository()) {}

  async list(context: RequestContext, query: EventListQuery) {
    const includeDrafts = hasAny(context, ["agenda.editar", "agenda.publicar"]);
    return (await this.repository.list(context.readOrganizationIds, query.from, query.to, includeDrafts)).map(mapSummary);
  }

  async get(context: RequestContext, id: string, occurrenceId?: string) {
    const event = await this.assertEvent(context, id);
    if (occurrenceId && !event.occurrences.some((occurrence) => occurrence.id === occurrenceId)) {
      throw new AppError(404, "AGENDA_OCCURRENCE_NOT_FOUND", "Ocorrência não encontrada.");
    }
    const role = await this.accessRole(context, event);
    if (event.status === "RASCUNHO" && role !== "MANAGER" && role !== "LEADER") throw new AppError(404, "AGENDA_EVENT_NOT_FOUND", "Evento não encontrado.");
    if (event.status !== "RASCUNHO" && role === "SUMMARY") throw new AppError(403, "AGENDA_EVENT_DETAIL_FORBIDDEN", "Os detalhes deste evento são restritos aos participantes.");
    return mapDetail(event, role, context.actor.userId, occurrenceId, context);
  }

  async create(context: RequestContext, payload: EventPayload) {
    const organizationId = requireWriteOrganization(context);
    if (!context.permissions.has("agenda.criar")) throw new AppError(403, "PERMISSION_DENIED", "Você não pode criar eventos.");
    return this.withReservationConflict(runAudited(context.actor, async (tx, audit) => {
      const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
      if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organização não encontrada.");
      payload = { ...payload, timezone: organization.timezone };
      const participants = uniquePeople(payload.participants);
      const leaderIds = [...new Set(payload.leaderIds)];
      await assertPeople(tx, organizationId, leaderIds, participants);
      const dates = recurrenceDates(payload);
      const duration = payload.endsAt.getTime() - payload.startsAt.getTime();
      if (!dates.length) throw new AppError(400, "EMPTY_RECURRENCE", "A recorrência não gerou ocorrências no período.");
      const horizon = addUtcMonths(payload.startsAt, 12);
      const event = await tx.agendaEventSeries.create({ data: {
        organizationId, createdById: context.actor.userId!, title: payload.title, description: payload.description,
        color: payload.color, allDay: payload.allDay, timezone: payload.timezone, startsAt: payload.startsAt,
        endsAt: payload.endsAt, locationType: payload.locationType, externalLocationName: payload.externalLocationName,
        externalAddress: payload.externalAddress, rrule: rruleValue(payload), recurrenceUntil: payload.recurrence?.endsAtLocal ? dates.at(-1) : null,
        occurrenceHorizonAt: horizon, participantVisibility: payload.participantVisibility,
        leaders: { create: leaderIds.map((personId) => ({ personId, addedById: context.actor.userId! })) },
        participants: { create: participants },
        reminders: { create: [...new Set(payload.reminderMinutes)].map((minutesBefore) => ({ minutesBefore })) },
        occurrences: { create: dates.map((startsAt, sequence) => ({ sequence: sequence + 1, originalStartsAt: startsAt, startsAt, endsAt: new Date(startsAt.getTime() + duration), externalLocationName: payload.externalLocationName, externalAddress: payload.externalAddress })) },
      }, include: { occurrences: true } });
      await reserveSpaces(tx, organizationId, event.occurrences, payload.spaceIds, context.actor.userId!);
      if (participants.length) await tx.agendaOccurrenceResponse.createMany({ data: event.occurrences.flatMap((occurrence) => participants.map((participant) => ({ occurrenceId: occurrence.id, personId: participant.personId }))) });
      await audit({ organizationId, module: "AGENDA", action: "criar_evento", targetType: "AgendaEventSeries", targetId: event.id, after: eventSnapshot(event), personIds: [...leaderIds, ...participants.map((item) => item.personId)] });
      const created = await this.assertEvent(context, event.id, tx);
      return mapDetail(created, "MANAGER", context.actor.userId, undefined, context);
    }));
  }

  async update(context: RequestContext, id: string, payload: EventUpdate) {
    return this.withReservationConflict(runAudited(context.actor, async (tx, audit) => {
      const existing = await this.assertEvent(context, id, tx);
      await this.assertCanManage(context, existing, tx, payload.scope === "SERIES" && (payload.recurrence !== undefined || payload.leaderIds !== undefined));
      const before = eventSnapshot(existing);
      if (payload.scope === "THIS") {
        const occurrence = await this.occurrenceOf(tx, existing.id, payload.occurrenceId!);
        const nextStartsAt = payload.startsAt ?? occurrence.startsAt;
        const nextEndsAt = payload.endsAt ?? occurrence.endsAt;
        if (nextEndsAt <= nextStartsAt) throw new AppError(400, "INVALID_EVENT_INTERVAL", "O término deve ser posterior ao início.");
        await tx.agendaOccurrence.update({ where: { id: occurrence.id }, data: {
          startsAt: payload.startsAt, endsAt: payload.endsAt, titleOverride: payload.title,
          descriptionOverride: payload.description, colorOverride: payload.color,
          locationTypeOverride: payload.locationType, externalLocationName: payload.externalLocationName, externalAddress: payload.externalAddress,
        } });
        if (payload.startsAt || payload.endsAt) await this.moveReservations(tx, occurrence.id, nextStartsAt, nextEndsAt);
        if (isMaterialChange(payload)) await this.resetOccurrence(tx, occurrence.id);
      } else if (payload.scope === "THIS_AND_FUTURE") {
        const pivot = await this.occurrenceOf(tx, existing.id, payload.occurrenceId!);
        const newSeries = await tx.agendaEventSeries.create({ data: {
          organizationId: existing.organizationId, createdById: existing.createdById, title: payload.title ?? existing.title,
          description: payload.description ?? existing.description, color: payload.color ?? existing.color, status: existing.status,
          allDay: payload.allDay ?? existing.allDay, timezone: payload.timezone ?? existing.timezone,
          startsAt: payload.startsAt ?? pivot.startsAt, endsAt: payload.endsAt ?? pivot.endsAt,
          locationType: payload.locationType ?? existing.locationType, externalLocationName: payload.externalLocationName ?? existing.externalLocationName,
          externalAddress: payload.externalAddress ?? existing.externalAddress,
          rrule: payload.recurrence === undefined ? existing.rrule : payload.recurrence ? JSON.stringify(payload.recurrence) : null,
          participantVisibility: payload.participantVisibility ?? existing.participantVisibility,
        } });
        await tx.agendaOccurrence.updateMany({ where: { seriesId: existing.id, startsAt: { gte: pivot.startsAt } }, data: { seriesId: newSeries.id } });
        if (existing.rrule) {
          const lastPrevious = await tx.agendaOccurrence.findFirst({
            where: { seriesId: existing.id },
            orderBy: { startsAt: "desc" },
            select: { startsAt: true },
          });
          await tx.agendaEventSeries.update({
            where: { id: existing.id },
            data: {
              rrule: truncateRecurrenceBefore(existing.rrule, pivot.startsAt, existing.timezone),
              recurrenceUntil: lastPrevious?.startsAt ?? null,
              occurrenceHorizonAt: pivot.startsAt,
            },
          });
        }
        await this.copySeriesRelations(tx, existing, newSeries.id, payload);
        if (payload.recurrence) {
          const moved = await tx.agendaOccurrence.findMany({
            where: { seriesId: newSeries.id },
            include: { reservations: { where: { status: "ATIVA" }, select: { spaceId: true } } },
          });
          const spaceIds = [...new Set(moved.flatMap((occurrence) => occurrence.reservations.map((reservation) => reservation.spaceId)))];
          const materializationStart = payload.startsAt ?? pivot.startsAt;
          await materializeAgendaSeries(tx, newSeries.id, {
            now: materializationStart,
            from: materializationStart,
            horizon: addUtcMonths(materializationStart, 12),
            replaceFrom: pivot.startsAt,
            spaceIds,
          });
        } else if (payload.recurrence === null) {
          const extraOccurrences = await tx.agendaOccurrence.findMany({
            where: { seriesId: newSeries.id, id: { not: pivot.id } },
            select: { id: true },
          });
          const extraIds = extraOccurrences.map((occurrence) => occurrence.id);
          if (extraIds.length) {
            await tx.agendaReservation.deleteMany({ where: { occurrenceId: { in: extraIds } } });
            await tx.agendaOccurrence.deleteMany({ where: { id: { in: extraIds } } });
          }
          await tx.agendaEventSeries.update({ where: { id: newSeries.id }, data: { recurrenceUntil: null, occurrenceHorizonAt: null } });
        } else if (payload.startsAt || payload.endsAt) {
          const startDelta = (payload.startsAt ?? pivot.startsAt).getTime() - pivot.startsAt.getTime();
          const duration = (payload.endsAt ?? pivot.endsAt).getTime() - (payload.startsAt ?? pivot.startsAt).getTime();
          const moved = await tx.agendaOccurrence.findMany({ where: { seriesId: newSeries.id }, orderBy: { startsAt: "asc" } });
          for (const occurrence of moved) {
            const startsAt = new Date(occurrence.startsAt.getTime() + startDelta);
            const endsAt = new Date(startsAt.getTime() + duration);
            await tx.agendaOccurrence.update({ where: { id: occurrence.id }, data: { startsAt, endsAt } });
            await this.moveReservations(tx, occurrence.id, startsAt, endsAt);
          }
        }
        if (isMaterialChange(payload)) {
          const moved = await tx.agendaOccurrence.findMany({ where: { seriesId: newSeries.id }, select: { id: true } });
          for (const occurrence of moved) await this.resetOccurrence(tx, occurrence.id);
        }
      } else {
        if (payload.leaderIds || payload.participants) await assertPeople(tx, existing.organizationId, payload.leaderIds ?? existing.leaders.map((item) => item.personId), payload.participants ?? existing.participants.map((item) => ({ personId: item.personId, type: item.type })));
        await tx.agendaEventSeries.update({ where: { id }, data: {
          title: payload.title, description: payload.description, color: payload.color, allDay: payload.allDay,
          timezone: payload.timezone, startsAt: payload.startsAt, endsAt: payload.endsAt, locationType: payload.locationType,
          externalLocationName: payload.externalLocationName, externalAddress: payload.externalAddress,
          participantVisibility: payload.participantVisibility,
          rrule: payload.recurrence === undefined ? undefined : payload.recurrence ? JSON.stringify(payload.recurrence) : null,
        } });
        await this.syncRelations(tx, existing, payload, context.actor.userId!);
        if (payload.recurrence) {
          const now = new Date();
          const future = existing.occurrences.filter((item) => item.startsAt >= now);
          const futureIds = future.map((item) => item.id);
          const existingSpaceIds = [...new Set(future.flatMap((item) => item.reservations.filter((reservation) => reservation.status === "ATIVA").map((reservation) => reservation.spaceId)))];
          await tx.agendaReservation.deleteMany({ where: { occurrenceId: { in: futureIds } } });
          await tx.agendaOccurrence.deleteMany({ where: { id: { in: futureIds } } });
          const startsAt = payload.startsAt ?? existing.startsAt;
          const endsAt = payload.endsAt ?? existing.endsAt;
          const dates = expandRecurrence({ ...payload.recurrence, timezone: payload.timezone ?? existing.timezone }, { from: now, until: addUtcMonths(startsAt, 12) });
          const pastMax = existing.occurrences.filter((item) => item.startsAt < now).reduce((max, item) => Math.max(max, item.sequence), 0);
          const created = await tx.agendaOccurrence.createManyAndReturn({ data: dates.map((date, index) => ({
            seriesId: existing.id, sequence: pastMax + index + 1, originalStartsAt: date, startsAt: date,
            endsAt: new Date(date.getTime() + (endsAt.getTime() - startsAt.getTime())),
            externalLocationName: payload.externalLocationName ?? existing.externalLocationName,
            externalAddress: payload.externalAddress ?? existing.externalAddress,
          })) });
          const participants = uniquePeople(payload.participants ?? existing.participants.map((item) => ({ personId: item.personId, type: item.type })));
          if (participants.length) await tx.agendaOccurrenceResponse.createMany({ data: created.flatMap((occurrence) => participants.map((item) => ({ occurrenceId: occurrence.id, personId: item.personId }))) });
          await reserveSpaces(tx, existing.organizationId, created, payload.spaceIds ?? existingSpaceIds, context.actor.userId!);
          await tx.agendaEventSeries.update({ where: { id: existing.id }, data: { occurrenceHorizonAt: addUtcMonths(startsAt, 12), recurrenceUntil: payload.recurrence.endsAtLocal ? dates.at(-1) : null } });
        } else if (payload.recurrence === null) {
          const now = new Date();
          const future = existing.occurrences.filter((item) => item.startsAt >= now);
          const keep = future[0];
          const removeIds = future.slice(1).map((item) => item.id);
          if (removeIds.length) {
            await tx.agendaReservation.deleteMany({ where: { occurrenceId: { in: removeIds } } });
            await tx.agendaOccurrence.deleteMany({ where: { id: { in: removeIds } } });
          }
          if (keep && (payload.startsAt || payload.endsAt)) {
            const startsAt = payload.startsAt ?? keep.startsAt;
            const endsAt = payload.endsAt ?? new Date(startsAt.getTime() + (existing.endsAt.getTime() - existing.startsAt.getTime()));
            await tx.agendaOccurrence.update({ where: { id: keep.id }, data: { startsAt, endsAt } });
            await this.moveReservations(tx, keep.id, startsAt, endsAt);
          }
          await tx.agendaEventSeries.update({ where: { id }, data: { recurrenceUntil: null, occurrenceHorizonAt: null } });
        } else if (payload.startsAt || payload.endsAt) {
          const startDelta = (payload.startsAt ?? existing.startsAt).getTime() - existing.startsAt.getTime();
          const duration = (payload.endsAt ?? existing.endsAt).getTime() - (payload.startsAt ?? existing.startsAt).getTime();
          const future = existing.occurrences.filter((item) => item.startsAt >= new Date());
          for (const occurrence of future) {
            const startsAt = new Date(occurrence.startsAt.getTime() + startDelta);
            const endsAt = new Date(startsAt.getTime() + duration);
            await tx.agendaOccurrence.update({ where: { id: occurrence.id }, data: { startsAt, endsAt } });
            await this.moveReservations(tx, occurrence.id, startsAt, endsAt);
          }
        }
        if (isMaterialChange(payload)) {
          const future = existing.occurrences.filter((item) => item.startsAt >= new Date());
          for (const occurrence of future) await this.resetOccurrence(tx, occurrence.id);
        }
      }
      const updated = await this.assertEvent(context, payload.scope === "THIS_AND_FUTURE" ? (await tx.agendaOccurrence.findUnique({ where: { id: payload.occurrenceId! }, select: { seriesId: true } }))!.seriesId : id, tx);
      if (existing.status === "PUBLICADO" && isMaterialChange(payload)) {
        const affectedIds = payload.scope === "THIS"
          ? [payload.occurrenceId!]
          : updated.occurrences.filter((occurrence) => occurrence.startsAt >= new Date() && occurrence.status === "AGENDADA").map((occurrence) => occurrence.id);
        await this.notifyOccurrences(tx, affectedIds, "changed", "A data, o horário ou o local do evento foi alterado. Confirme novamente sua participação.");
      }
      await audit({ organizationId: existing.organizationId, module: "AGENDA", action: "editar_evento", targetType: "AgendaEventSeries", targetId: updated.id, before, after: eventSnapshot(updated) });
      return mapDetail(updated, "MANAGER", context.actor.userId, undefined, context);
    }));
  }

  async publish(context: RequestContext, id: string) {
    if (!context.permissions.has("agenda.publicar")) throw new AppError(403, "PERMISSION_DENIED", "Você não pode publicar eventos.");
    return runAudited(context.actor, async (tx, audit) => {
      const event = await this.assertEvent(context, id, tx);
      if (event.status !== "RASCUNHO") throw new AppError(409, "EVENT_ALREADY_PUBLISHED", "Somente rascunhos podem ser publicados.");
      const updated = await this.repository.setStatus(id, "PUBLICADO", tx);
      const recipients = new Map<string, { person: EventDetail["leaders"][number]["person"] }>();
      for (const leader of event.leaders) recipients.set(leader.personId, { person: leader.person });
      for (const participant of event.participants) recipients.set(participant.personId, { person: participant.person });
      const scaledPersonIds = [...new Set(event.occurrences.flatMap((occurrence) => occurrence.scale.map((item) => item.personId)))];
      if (scaledPersonIds.length) {
        const scaledPeople = await tx.person.findMany({ where: { id: { in: scaledPersonIds }, organizationId: event.organizationId }, include: { user: { select: { id: true, status: true } } } });
        for (const person of scaledPeople) recipients.set(person.id, { person });
      }
      const firstOccurrence = event.occurrences.find((item) => item.status === "AGENDADA");
      await enqueueAgendaNotifications(tx, [...recipients].flatMap(([personId, { person }]) => {
        const payload = {
          inApp: person.user?.status === "ATIVO" ? { userId: person.user.id, occurrenceId: firstOccurrence?.id, title: event.title, body: "Um evento foi publicado para você.", linkUrl: `/app/agenda/eventos/${event.id}` } : undefined,
          email: person.email ? { to: person.email, subject: `Evento: ${event.title}`, text: `O evento ${event.title} foi publicado.`, churchName: event.organization.name } : undefined,
        };
        return payload.inApp || payload.email ? [{ organizationId: event.organizationId, aggregateType: "AgendaEventSeries", aggregateId: event.id, idempotencyKey: `agenda:published:${event.id}:${personId}`, payload }] : [];
      }));
      await audit({ organizationId: event.organizationId, module: "AGENDA", action: "publicar_evento", targetType: "AgendaEventSeries", targetId: id, before: eventSnapshot(event), after: eventSnapshot(updated) });
      return updated;
    });
  }

  async cancel(context: RequestContext, id: string, payload: CancelPayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const event = await this.assertEvent(context, id, tx);
      await this.assertCanManage(context, event, tx, payload.scope === "SERIES", "agenda.cancelar");
      const now = new Date();
      let affectedOccurrenceIds: string[] = [];
      if (payload.scope === "SERIES") {
        affectedOccurrenceIds = event.occurrences.filter((occurrence) => occurrence.startsAt >= now && occurrence.status === "AGENDADA").map((occurrence) => occurrence.id);
        await this.repository.setStatus(id, "CANCELADO", tx);
        await tx.agendaOccurrence.updateMany({ where: { seriesId: id, startsAt: { gte: now } }, data: { status: "CANCELADA", cancelledAt: now } });
        await tx.agendaReservation.updateMany({ where: { occurrence: { seriesId: id, startsAt: { gte: now } }, status: "ATIVA" }, data: { status: "LIBERADA", releasedAt: now } });
      } else {
        const occurrence = await this.occurrenceOf(tx, id, payload.occurrenceId!);
        const where = payload.scope === "THIS" ? { id: occurrence.id } : { seriesId: id, startsAt: { gte: occurrence.startsAt } };
        affectedOccurrenceIds = (await tx.agendaOccurrence.findMany({ where: { ...where, status: "AGENDADA" }, select: { id: true } })).map((item) => item.id);
        await tx.agendaOccurrence.updateMany({ where, data: { status: "CANCELADA", cancelledAt: now } });
        await tx.agendaReservation.updateMany({ where: { occurrence: where, status: "ATIVA" }, data: { status: "LIBERADA", releasedAt: now } });
      }
      if (event.status === "PUBLICADO") {
        const reason = payload.reason ? ` Motivo: ${payload.reason}` : "";
        await this.notifyOccurrences(tx, affectedOccurrenceIds, `cancelled:${payload.scope}`, `O evento foi cancelado.${reason}`);
      }
      await audit({ organizationId: event.organizationId, module: "AGENDA", action: "cancelar_evento", targetType: "AgendaEventSeries", targetId: id, before: eventSnapshot(event), after: { scope: payload.scope, reason: payload.reason } });
      return { ok: true };
    });
  }

  async removeDraft(context: RequestContext, id: string) {
    return runAudited(context.actor, async (tx, audit) => {
      const event = await this.assertEvent(context, id, tx);
      await this.assertCanManage(context, event, tx, true);
      if (event.status !== "RASCUNHO") throw new AppError(409, "PUBLISHED_EVENT_CANNOT_BE_DELETED", "Evento publicado deve ser cancelado.");
      await tx.agendaReservation.deleteMany({ where: { occurrence: { seriesId: id } } });
      await tx.agendaEventSeries.delete({ where: { id } });
      await audit({ organizationId: event.organizationId, module: "AGENDA", action: "excluir", targetType: "AgendaEventSeries", targetId: id, before: eventSnapshot(event) });
    });
  }

  private async assertEvent(context: RequestContext, id: string, db?: AgendaDb) {
    const event = await this.repository.findDetail(id, context.readOrganizationIds, db);
    if (!event) throw new AppError(404, "AGENDA_EVENT_NOT_FOUND", "Evento não encontrado.");
    return event;
  }

  private async accessRole(context: RequestContext, event: EventDetail) {
    if (hasAny(context, [...MANAGEMENT_PERMISSIONS])) return "MANAGER";
    const personId = event.leaders.find((item) => item.person.user?.id === context.actor.userId)?.personId;
    if (personId) return "LEADER";
    if (event.participants.some((item) => item.person.user?.id === context.actor.userId)) return "PARTICIPANT";
    return "SUMMARY";
  }

  private async assertCanManage(context: RequestContext, event: EventDetail, db: AgendaDb, ownerOnly = false, permission = "agenda.editar") {
    if (context.permissions.has(permission as never) && (!ownerOnly || event.createdById === context.actor.userId || context.permissions.has("agenda.publicar"))) return;
    if (!ownerOnly && event.leaders.some((leader) => leader.person.user?.id === context.actor.userId)) return;
    throw new AppError(403, "AGENDA_MANAGEMENT_FORBIDDEN", "Você não pode gerenciar este evento.");
  }

  private async occurrenceOf(db: AgendaDb, seriesId: string, occurrenceId: string) {
    const occurrence = await db.agendaOccurrence.findFirst({ where: { id: occurrenceId, seriesId } });
    if (!occurrence) throw new AppError(404, "AGENDA_OCCURRENCE_NOT_FOUND", "Ocorrência não encontrada.");
    return occurrence;
  }

  private async resetOccurrence(db: AgendaDb, occurrenceId: string) {
    await db.agendaOccurrenceResponse.updateMany({ where: { occurrenceId }, data: { response: "PENDENTE", acknowledgedAt: null, justification: null, respondedAt: null, recordedById: null } });
    await db.agendaOccurrenceScale.updateMany({ where: { occurrenceId }, data: { status: "PENDENTE", respondedAt: null, recordedById: null } });
  }

  private async syncRelations(db: AgendaDb, existing: EventDetail, payload: EventUpdate, actorId: string) {
    if (payload.leaderIds) {
      await db.agendaEventLeader.deleteMany({ where: { seriesId: existing.id } });
      await db.agendaEventLeader.createMany({ data: [...new Set(payload.leaderIds)].map((personId) => ({ seriesId: existing.id, personId, addedById: actorId })) });
    }
    if (payload.participants) {
      const participants = uniquePeople(payload.participants);
      await db.agendaSeriesParticipant.deleteMany({ where: { seriesId: existing.id } });
      await db.agendaSeriesParticipant.createMany({ data: participants.map((item) => ({ seriesId: existing.id, ...item })) });
      const future = existing.occurrences.filter((occurrence) => occurrence.startsAt >= new Date());
      await db.agendaOccurrenceResponse.deleteMany({ where: { occurrenceId: { in: future.map((item) => item.id) } } });
      await db.agendaOccurrenceResponse.createMany({ data: future.flatMap((occurrence) => participants.map((item) => ({ occurrenceId: occurrence.id, personId: item.personId }))) });
    }
  }

  private async copySeriesRelations(db: AgendaDb, existing: EventDetail, newSeriesId: string, payload: EventUpdate) {
    const leaders = payload.leaderIds ?? existing.leaders.map((item) => item.personId);
    const participants = payload.participants ?? existing.participants.map((item) => ({ personId: item.personId, type: item.type }));
    await db.agendaEventLeader.createMany({ data: leaders.map((personId) => ({ seriesId: newSeriesId, personId, addedById: existing.createdById })) });
    await db.agendaSeriesParticipant.createMany({ data: uniquePeople(participants).map((item) => ({ seriesId: newSeriesId, ...item })) });
  }

  private async moveReservations(db: AgendaDb, occurrenceId: string, startsAt: Date, endsAt: Date) {
    const reservations = await db.agendaReservation.findMany({ where: { occurrenceId, status: "ATIVA" }, include: { space: true } });
    for (const reservation of reservations) {
      await db.agendaReservation.update({ where: { id: reservation.id }, data: {
        startsAt, endsAt,
        effectiveStartsAt: new Date(startsAt.getTime() - reservation.space.preparationMinutes * 60_000),
        effectiveEndsAt: new Date(endsAt.getTime() + reservation.space.cleanupMinutes * 60_000),
      } });
    }
  }

  private async notifyOccurrences(db: AgendaDb, occurrenceIds: string[], kind: string, body: string) {
    for (const occurrenceId of [...new Set(occurrenceIds)]) {
      const audience = await loadOccurrenceRecipients(db, occurrenceId);
      if (!audience) continue;
      const notifications = audience.recipients.flatMap((recipient) => {
        const notification = agendaRecipientNotification({
          recipient,
          organizationId: audience.occurrence.series.organizationId,
          churchName: audience.occurrence.series.organization.name,
          seriesId: audience.occurrence.seriesId,
          occurrenceId,
          eventTitle: audience.occurrence.series.title,
          kind: `${kind}:${audience.occurrence.updatedAt.toISOString()}`,
          body,
        });
        return notification ? [notification] : [];
      });
      await enqueueAgendaNotifications(db, notifications);
    }
  }

  private async withReservationConflict<T>(promise: Promise<T>) {
    try {
      return await promise;
    } catch (error) {
      if (isReservationConstraintError(error)) throw new AppError(409, "AGENDA_RESERVATION_CONFLICT", "Um ou mais espaços já estão reservados neste período.");
      throw error;
    }
  }
}

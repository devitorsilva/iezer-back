import type { Prisma } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import { runAudited } from "../../../lib/audit.js";
import { AppError } from "../../../lib/errors.js";
import { enqueueAgendaNotifications } from "../notificacoes/outbox.js";
import { agendaRecipientNotification, loadOccurrenceRecipients, uniqueAgendaRecipients } from "../notificacoes/recipients.js";
import { isReservationConstraintError } from "../reservas/service.js";
import { OccurrenceRepository, type OccurrenceDb, type OccurrenceDetail } from "./repository.js";
import type { AttendancePayload, OccurrenceUpdate, ResponsePayload, ScalePayload } from "./schemas.js";

function snapshot(occurrence: OccurrenceDetail) {
  return { id: occurrence.id, seriesId: occurrence.seriesId, startsAt: occurrence.startsAt.toISOString(), endsAt: occurrence.endsAt.toISOString(), status: occurrence.status };
}

export class OccurrenceService {
  constructor(private readonly repository = new OccurrenceRepository()) {}

  async update(context: RequestContext, id: string, payload: OccurrenceUpdate) {
    try {
      return await runAudited(context.actor, async (tx, audit) => {
      const occurrence = await this.assertOccurrence(context, id, tx);
      this.assertManager(context, occurrence, "agenda.editar");
      const startsAt = payload.startsAt ?? occurrence.startsAt;
      const endsAt = payload.endsAt ?? occurrence.endsAt;
      if (endsAt <= startsAt) throw new AppError(400, "INVALID_EVENT_INTERVAL", "O término deve ser posterior ao início.");
      const material = payload.startsAt !== undefined || payload.endsAt !== undefined || payload.locationType !== undefined || payload.locationName !== undefined || payload.address !== undefined;
      const updated = await tx.agendaOccurrence.update({ where: { id }, data: {
        startsAt: payload.startsAt, endsAt: payload.endsAt, titleOverride: payload.title,
        descriptionOverride: payload.description, colorOverride: payload.color,
        locationTypeOverride: payload.locationType, externalLocationName: payload.locationName, externalAddress: payload.address,
      }, include: { ...occurrenceIncludeForUpdate } });
      if (payload.startsAt || payload.endsAt) {
        const reservations = await tx.agendaReservation.findMany({ where: { occurrenceId: id, status: "ATIVA" }, include: { space: true } });
        for (const reservation of reservations) await tx.agendaReservation.update({ where: { id: reservation.id }, data: {
          startsAt, endsAt,
          effectiveStartsAt: new Date(startsAt.getTime() - reservation.space.preparationMinutes * 60_000),
          effectiveEndsAt: new Date(endsAt.getTime() + reservation.space.cleanupMinutes * 60_000),
        } });
      }
      if (material) {
        await tx.agendaOccurrenceResponse.updateMany({ where: { occurrenceId: id }, data: { response: "PENDENTE", acknowledgedAt: null, justification: null, respondedAt: null, recordedById: null } });
        await tx.agendaOccurrenceScale.updateMany({ where: { occurrenceId: id }, data: { status: "PENDENTE", respondedAt: null, recordedById: null } });
        await this.notifyOccurrence(tx, id, "changed", "A data, o horário ou o local do evento foi alterado. Confirme novamente sua participação.");
      }
      await audit({ organizationId: occurrence.series.organizationId, module: "AGENDA", action: "editar_ocorrencia", targetType: "AgendaOccurrence", targetId: id, before: snapshot(occurrence), after: snapshot(updated as OccurrenceDetail) });
        return updated;
      });
    } catch (error) {
      if (isReservationConstraintError(error)) throw new AppError(409, "AGENDA_RESERVATION_CONFLICT", "Um ou mais espaços já estão reservados neste período.");
      throw error;
    }
  }

  async respond(context: RequestContext, id: string, payload: ResponsePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const occurrence = await this.assertOccurrence(context, id, tx);
      const actorPersonId = await this.actorPersonId(tx, context);
      const targetPersonId = payload.personId ?? actorPersonId;
      if (!targetPersonId) throw new AppError(403, "MEMBER_ACCESS_REQUIRED", "Sua conta não está vinculada a um membro.");
      const manager = this.isManager(context, occurrence);
      if (targetPersonId !== actorPersonId && !manager) throw new AppError(403, "AGENDA_RESPONSE_FORBIDDEN", "Somente líderes podem registrar resposta por outra pessoa.");
      if (new Date() >= occurrence.startsAt && !manager) throw new AppError(409, "RESPONSE_WINDOW_CLOSED", "Após o início, somente gestores podem alterar respostas.");
      const participant = occurrence.series.participants.find((item) => item.personId === targetPersonId);
      if (!participant) throw new AppError(404, "AGENDA_PARTICIPANT_NOT_FOUND", "Membro não participa deste evento.");
      if (participant.type === "CONVOCADO" && payload.response === "NAO_VOU" && !payload.justification) throw new AppError(400, "JUSTIFICATION_REQUIRED", "A recusa de convocação exige justificativa.");
      if (participant.type === "CONVOCADO" && payload.acknowledged !== true && !occurrence.responses.find((item) => item.personId === targetPersonId)?.acknowledgedAt) throw new AppError(400, "ACKNOWLEDGEMENT_REQUIRED", "Confirme a ciência da convocação.");
      const response = await tx.agendaOccurrenceResponse.upsert({ where: { occurrenceId_personId: { occurrenceId: id, personId: targetPersonId } }, create: {
        occurrenceId: id, personId: targetPersonId, response: payload.response,
        acknowledgedAt: payload.acknowledged ? new Date() : null, justification: payload.justification,
        respondedAt: new Date(), recordedById: context.actor.userId,
      }, update: {
        response: payload.response, acknowledgedAt: payload.acknowledged ? new Date() : undefined,
        justification: payload.justification, respondedAt: new Date(), recordedById: context.actor.userId,
      } });
      await enqueueAgendaNotifications(tx, occurrence.series.leaders.flatMap((leader) => leader.person.user?.status === "ATIVO" ? [{ organizationId: occurrence.series.organizationId, aggregateType: "AgendaOccurrenceResponse", aggregateId: `${id}:${targetPersonId}`, idempotencyKey: `agenda:response:${id}:${targetPersonId}:${response.updatedAt.toISOString()}`, payload: { inApp: { userId: leader.person.user.id, occurrenceId: id, title: occurrence.series.title, body: "Uma resposta de participação foi atualizada.", linkUrl: `/app/agenda/eventos/${occurrence.seriesId}` } } }] : []));
      await audit({ organizationId: occurrence.series.organizationId, module: "AGENDA", action: "responder_evento", targetType: "AgendaOccurrenceResponse", targetId: `${id}:${targetPersonId}`, after: response, personIds: [targetPersonId] });
      return response;
    });
  }

  async setScale(context: RequestContext, id: string, payload: ScalePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const occurrence = await this.assertOccurrence(context, id, tx);
      const actorPersonId = await this.actorPersonId(tx, context);
      const manager = this.isManager(context, occurrence, "agenda.escala.gerenciar");
      if (!manager && (payload.items.length !== 1 || payload.items[0].personId !== actorPersonId || payload.items[0].status === "PENDENTE")) throw new AppError(403, "AGENDA_SCALE_FORBIDDEN", "Você só pode responder à própria escala.");
      await this.assertActiveMembers(tx, occurrence.series.organizationId, payload.items.map((item) => item.personId));
      const previousPersonIds = occurrence.scale.map((item) => item.personId);
      if (manager) await tx.agendaOccurrenceScale.deleteMany({ where: { occurrenceId: id, personId: { notIn: payload.items.map((item) => item.personId) } } });
      const saved = [];
      for (const item of payload.items) {
        const row = await tx.agendaOccurrenceScale.upsert({ where: { occurrenceId_personId: { occurrenceId: id, personId: item.personId } }, create: { occurrenceId: id, personId: item.personId, status: item.status, respondedAt: item.status === "PENDENTE" ? null : new Date(), recordedById: context.actor.userId }, update: { status: item.status, respondedAt: item.status === "PENDENTE" ? null : new Date(), recordedById: context.actor.userId } });
        saved.push(row);
        if (item.status === "ACEITO") await tx.agendaOccurrenceResponse.upsert({ where: { occurrenceId_personId: { occurrenceId: id, personId: item.personId } }, create: { occurrenceId: id, personId: item.personId, response: "VOU", respondedAt: new Date(), recordedById: context.actor.userId }, update: { response: "VOU", respondedAt: new Date(), recordedById: context.actor.userId } });
      }
      if (manager && occurrence.series.status === "PUBLICADO") {
        const affectedPersonIds = [...new Set([...previousPersonIds, ...payload.items.map((item) => item.personId)])];
        const people = await tx.person.findMany({ where: { id: { in: affectedPersonIds }, organizationId: occurrence.series.organizationId }, include: { user: { select: { id: true, status: true } } } });
        const version = [...saved.map((item) => item.updatedAt), ...occurrence.scale.map((item) => item.updatedAt)]
          .sort((left, right) => left.getTime() - right.getTime()).at(-1)?.toISOString() ?? occurrence.updatedAt.toISOString();
        const notifications = uniqueAgendaRecipients(people).flatMap((recipient) => {
          const notification = agendaRecipientNotification({
            recipient,
            organizationId: occurrence.series.organizationId,
            churchName: occurrence.series.organization.name,
            seriesId: occurrence.seriesId,
            occurrenceId: id,
            eventTitle: occurrence.series.title,
            kind: `scale:${version}`,
            body: "A escala deste evento foi alterada. Consulte sua participação.",
          });
          return notification ? [notification] : [];
        });
        await enqueueAgendaNotifications(tx, notifications);
      }
      await audit({ organizationId: occurrence.series.organizationId, module: "AGENDA", action: "gerenciar_escala", targetType: "AgendaOccurrence", targetId: id, after: saved, personIds: payload.items.map((item) => item.personId) });
      return { items: saved };
    });
  }

  async setAttendance(context: RequestContext, id: string, payload: AttendancePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const occurrence = await this.assertOccurrence(context, id, tx);
      this.assertManager(context, occurrence, "agenda.presenca.registrar");
      if (new Date() < occurrence.startsAt) throw new AppError(409, "ATTENDANCE_NOT_OPEN", "A presença só pode ser registrada após o início.");
      await this.assertActiveMembers(tx, occurrence.series.organizationId, payload.items.map((item) => item.personId));
      await tx.agendaAttendance.deleteMany({ where: { occurrenceId: id, personId: { notIn: payload.items.map((item) => item.personId) } } });
      const saved = [];
      for (const item of payload.items) saved.push(await tx.agendaAttendance.upsert({ where: { occurrenceId_personId: { occurrenceId: id, personId: item.personId } }, create: { occurrenceId: id, personId: item.personId, status: item.status, justification: item.justification, recordedById: context.actor.userId! }, update: { status: item.status, justification: item.justification, recordedById: context.actor.userId!, recordedAt: new Date() } }));
      await audit({ organizationId: occurrence.series.organizationId, module: "AGENDA", action: "registrar_presenca", targetType: "AgendaOccurrence", targetId: id, after: saved, personIds: payload.items.map((item) => item.personId) });
      return { items: saved };
    });
  }

  private async assertOccurrence(context: RequestContext, id: string, db: OccurrenceDb) {
    const occurrence = await this.repository.find(id, context.readOrganizationIds, db);
    if (!occurrence) throw new AppError(404, "AGENDA_OCCURRENCE_NOT_FOUND", "Ocorrência não encontrada.");
    return occurrence;
  }

  private isManager(context: RequestContext, occurrence: OccurrenceDetail, permission = "agenda.editar") {
    return context.permissions.has(permission as never) || occurrence.series.createdById === context.actor.userId || occurrence.series.leaders.some((leader) => leader.person.user?.id === context.actor.userId);
  }

  private assertManager(context: RequestContext, occurrence: OccurrenceDetail, permission: string) {
    if (!this.isManager(context, occurrence, permission)) throw new AppError(403, "AGENDA_MANAGEMENT_FORBIDDEN", "Você não pode gerenciar esta ocorrência.");
  }

  private async actorPersonId(db: OccurrenceDb, context: RequestContext) {
    if (!context.actor.userId) return null;
    return (await db.user.findUnique({ where: { id: context.actor.userId }, select: { personId: true } }))?.personId ?? null;
  }

  private async assertActiveMembers(db: OccurrenceDb, organizationId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await db.person.count({ where: { id: { in: unique }, organizationId, status: "ATIVO", bond: "MEMBRO" } });
    if (count !== unique.length) throw new AppError(400, "INVALID_AGENDA_MEMBER", "Selecione somente membros ativos desta organização.");
  }

  private async notifyOccurrence(db: OccurrenceDb, occurrenceId: string, kind: string, body: string) {
    const audience = await loadOccurrenceRecipients(db, occurrenceId);
    if (!audience || audience.occurrence.series.status !== "PUBLICADO") return;
    await enqueueAgendaNotifications(db, audience.recipients.flatMap((recipient) => {
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
    }));
  }
}

const occurrenceIncludeForUpdate = {
  series: { include: { organization: { select: { name: true } }, leaders: { include: { person: { include: { user: { select: { id: true, status: true } } } } } }, participants: { include: { person: { include: { user: { select: { id: true, status: true } } } } } } } },
  responses: true, scale: true, attendances: true,
} satisfies Prisma.AgendaOccurrenceInclude;

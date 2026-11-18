DROP TRIGGER IF EXISTS "AgendaReservation_organization_guard" ON "AgendaReservation";
DROP TRIGGER IF EXISTS "AgendaAttendance_organization_guard" ON "AgendaAttendance";
DROP TRIGGER IF EXISTS "AgendaOccurrenceScale_organization_guard" ON "AgendaOccurrenceScale";
DROP TRIGGER IF EXISTS "AgendaOccurrenceResponse_organization_guard" ON "AgendaOccurrenceResponse";
DROP TRIGGER IF EXISTS "AgendaSeriesParticipant_organization_guard" ON "AgendaSeriesParticipant";
DROP TRIGGER IF EXISTS "AgendaEventLeader_organization_guard" ON "AgendaEventLeader";
DROP FUNCTION IF EXISTS "agenda_assert_reservation_organization"();
DROP FUNCTION IF EXISTS "agenda_assert_occurrence_person_organization"();
DROP FUNCTION IF EXISTS "agenda_assert_series_person_organization"();

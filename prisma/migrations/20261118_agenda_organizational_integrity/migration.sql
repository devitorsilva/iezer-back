-- Prevent cross-organization links even when data is written outside the API.
CREATE OR REPLACE FUNCTION "agenda_assert_series_person_organization"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  series_organization text;
  person_organization text;
BEGIN
  SELECT "organizationId" INTO series_organization
  FROM "AgendaEventSeries"
  WHERE id = NEW."seriesId";

  SELECT "organizationId" INTO person_organization
  FROM "Person"
  WHERE id = NEW."personId";

  IF series_organization IS NULL OR person_organization IS NULL OR series_organization <> person_organization THEN
    RAISE EXCEPTION 'Agenda person must belong to the event organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgendaEventLeader_organization_guard"
BEFORE INSERT OR UPDATE OF "seriesId", "personId" ON "AgendaEventLeader"
FOR EACH ROW EXECUTE FUNCTION "agenda_assert_series_person_organization"();

CREATE TRIGGER "AgendaSeriesParticipant_organization_guard"
BEFORE INSERT OR UPDATE OF "seriesId", "personId" ON "AgendaSeriesParticipant"
FOR EACH ROW EXECUTE FUNCTION "agenda_assert_series_person_organization"();

CREATE OR REPLACE FUNCTION "agenda_assert_occurrence_person_organization"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  occurrence_organization text;
  person_organization text;
BEGIN
  SELECT series."organizationId" INTO occurrence_organization
  FROM "AgendaOccurrence" occurrence
  JOIN "AgendaEventSeries" series ON series.id = occurrence."seriesId"
  WHERE occurrence.id = NEW."occurrenceId";

  SELECT "organizationId" INTO person_organization
  FROM "Person"
  WHERE id = NEW."personId";

  IF occurrence_organization IS NULL OR person_organization IS NULL OR occurrence_organization <> person_organization THEN
    RAISE EXCEPTION 'Agenda person must belong to the occurrence organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgendaOccurrenceResponse_organization_guard"
BEFORE INSERT OR UPDATE OF "occurrenceId", "personId" ON "AgendaOccurrenceResponse"
FOR EACH ROW EXECUTE FUNCTION "agenda_assert_occurrence_person_organization"();

CREATE TRIGGER "AgendaOccurrenceScale_organization_guard"
BEFORE INSERT OR UPDATE OF "occurrenceId", "personId" ON "AgendaOccurrenceScale"
FOR EACH ROW EXECUTE FUNCTION "agenda_assert_occurrence_person_organization"();

CREATE TRIGGER "AgendaAttendance_organization_guard"
BEFORE INSERT OR UPDATE OF "occurrenceId", "personId" ON "AgendaAttendance"
FOR EACH ROW EXECUTE FUNCTION "agenda_assert_occurrence_person_organization"();

CREATE OR REPLACE FUNCTION "agenda_assert_reservation_organization"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  space_organization text;
  occurrence_organization text;
BEGIN
  SELECT "organizationId" INTO space_organization
  FROM "AgendaSpace"
  WHERE id = NEW."spaceId";

  IF NEW."occurrenceId" IS NOT NULL THEN
    SELECT series."organizationId" INTO occurrence_organization
    FROM "AgendaOccurrence" occurrence
    JOIN "AgendaEventSeries" series ON series.id = occurrence."seriesId"
    WHERE occurrence.id = NEW."occurrenceId";
  END IF;

  IF space_organization IS NULL
    OR space_organization <> NEW."organizationId"
    OR (NEW."occurrenceId" IS NOT NULL AND (occurrence_organization IS NULL OR occurrence_organization <> NEW."organizationId")) THEN
    RAISE EXCEPTION 'Agenda reservation must use space and occurrence from its organization'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgendaReservation_organization_guard"
BEFORE INSERT OR UPDATE OF "organizationId", "spaceId", "occurrenceId" ON "AgendaReservation"
FOR EACH ROW EXECUTE FUNCTION "agenda_assert_reservation_organization"();

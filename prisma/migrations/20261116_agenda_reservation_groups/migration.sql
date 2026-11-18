-- Group the rows that compose one atomic multi-space reservation.
ALTER TABLE "AgendaReservation" ADD COLUMN "groupId" TEXT;

-- Existing event reservations share their occurrence. Standalone legacy rows
-- become one-item groups so their behavior remains unchanged.
UPDATE "AgendaReservation"
SET "groupId" = COALESCE("occurrenceId", "id")
WHERE "groupId" IS NULL;

CREATE INDEX "AgendaReservation_groupId_idx" ON "AgendaReservation"("groupId");

-- Event reservations are created in bulk by occurrence. Keeping this at the
-- database boundary makes every current and future event row share the same
-- group without coupling event creation to the standalone reservation API.
CREATE FUNCTION "AgendaReservation_assign_group"() RETURNS trigger AS $$
BEGIN
  NEW."groupId" := COALESCE(NEW."groupId", NEW."occurrenceId", NEW."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AgendaReservation_assign_group_trigger"
BEFORE INSERT ON "AgendaReservation"
FOR EACH ROW EXECUTE FUNCTION "AgendaReservation_assign_group"();

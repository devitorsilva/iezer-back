import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = "prisma/migrations/20261118_agenda_organizational_integrity/migration.sql";

test("migration protege vínculos organizacionais da agenda", () => {
  assert.equal(existsSync(migration), true, "migration de integridade organizacional não existe");
  const sql = readFileSync(migration, "utf8");
  for (const table of [
    "AgendaEventLeader",
    "AgendaSeriesParticipant",
    "AgendaOccurrenceResponse",
    "AgendaOccurrenceScale",
    "AgendaAttendance",
    "AgendaReservation",
  ]) {
    assert.match(sql, new RegExp(`CREATE TRIGGER[\\s\\S]+${table}`), `${table} não está protegido por trigger`);
  }
});

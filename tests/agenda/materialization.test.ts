import assert from "node:assert/strict";
import test from "node:test";
import { materializationHorizon, missingMaterializationDates, truncateRecurrenceBefore } from "../../src/modules/agenda/materializacao/service.js";

const monthly = {
  frequency: "MONTHLY" as const,
  interval: 1,
  startsAtLocal: "2026-01-15T10:00",
  timezone: "UTC",
};

test("horizonte de materializacao mantém doze meses futuros", () => {
  assert.equal(materializationHorizon(new Date("2026-11-16T12:00:00Z")).toISOString(), "2027-11-16T12:00:00.000Z");
});

test("materializacao incremental retorna somente ocorrencias ausentes", () => {
  const missing = missingMaterializationDates(
    monthly,
    [new Date("2026-11-15T10:00:00Z"), new Date("2026-12-15T10:00:00Z")],
    new Date("2026-11-01T00:00:00Z"),
    new Date("2027-02-28T23:59:59Z"),
  );
  assert.deepEqual(missing.map((date) => date.toISOString()), [
    "2027-01-15T10:00:00.000Z",
    "2027-02-15T10:00:00.000Z",
  ]);
});

test("materializacao idempotente não recria datas existentes", () => {
  const existing = [
    new Date("2026-11-15T10:00:00Z"),
    new Date("2026-12-15T10:00:00Z"),
    new Date("2027-01-15T10:00:00Z"),
  ];
  assert.equal(
    missingMaterializationDates(monthly, existing, new Date("2026-11-01T00:00:00Z"), new Date("2027-01-31T23:59:59Z")).length,
    0,
  );
});

test("janela futura não inclui nem altera ocorrencias passadas", () => {
  const missing = missingMaterializationDates(
    monthly,
    [new Date("2026-01-15T10:00:00Z")],
    new Date("2026-11-16T00:00:00Z"),
    new Date("2027-01-31T23:59:59Z"),
  );
  assert.deepEqual(missing.map((date) => date.toISOString()), [
    "2026-12-15T10:00:00.000Z",
    "2027-01-15T10:00:00.000Z",
  ]);
});

test("corte de serie encerra a regra antiga imediatamente antes do pivo", () => {
  const truncated = JSON.parse(truncateRecurrenceBefore(
    JSON.stringify({ ...monthly, count: 24 }),
    new Date("2026-11-15T10:00:00Z"),
    "UTC",
  ));
  assert.equal(truncated.count, undefined);
  assert.equal(truncated.endsAtLocal, "2026-11-15T09:59:59");
});

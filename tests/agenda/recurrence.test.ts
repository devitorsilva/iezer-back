import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandRecurrence } from "../../src/modules/agenda/recurrence.js";

describe("expandRecurrence", () => {
  it("ignora meses sem o dia de inicio", () => {
    const dates = expandRecurrence({
      startsAtLocal: "2026-01-31T09:00:00",
      timezone: "America/Sao_Paulo",
      frequency: "MONTHLY",
      interval: 1,
      count: 4,
    });

    assert.deepEqual(
      dates.map((date) => date.toISOString()),
      [
        "2026-01-31T12:00:00.000Z",
        "2026-03-31T12:00:00.000Z",
        "2026-05-31T12:00:00.000Z",
        "2026-07-31T12:00:00.000Z",
      ],
    );
  });

  it("mantem 29 de fevereiro apenas em anos bissextos", () => {
    const dates = expandRecurrence({
      startsAtLocal: "2024-02-29T19:30:00",
      timezone: "America/Sao_Paulo",
      frequency: "YEARLY",
      interval: 1,
      count: 3,
    });

    assert.deepEqual(
      dates.map((date) => date.toISOString()),
      ["2024-02-29T22:30:00.000Z", "2028-02-29T22:30:00.000Z", "2032-02-29T22:30:00.000Z"],
    );
  });

  it("expande recorrencia semanal nos dias selecionados", () => {
    const dates = expandRecurrence({
      startsAtLocal: "2026-11-02T20:00:00",
      timezone: "America/Sao_Paulo",
      frequency: "WEEKLY",
      interval: 1,
      weekdays: ["MO", "WE"],
      count: 4,
    });

    assert.deepEqual(
      dates.map((date) => date.toISOString()),
      [
        "2026-11-02T23:00:00.000Z",
        "2026-11-04T23:00:00.000Z",
        "2026-11-09T23:00:00.000Z",
        "2026-11-11T23:00:00.000Z",
      ],
    );
  });

  it("limita a materializacao pela janela informada", () => {
    const dates = expandRecurrence(
      {
        startsAtLocal: "2026-01-01T08:00:00",
        timezone: "America/Sao_Paulo",
        frequency: "DAILY",
        interval: 1,
      },
      { until: new Date("2026-01-03T23:59:59.999Z") },
    );

    assert.equal(dates.length, 3);
    assert.equal(dates.at(-1)?.toISOString(), "2026-01-03T11:00:00.000Z");
  });

  it("rejeita timezone IANA invalido", () => {
    assert.throws(
      () =>
        expandRecurrence({
          startsAtLocal: "2026-01-01T08:00:00",
          timezone: "timezone-invalido",
          frequency: "DAILY",
          count: 1,
        }),
      /Timezone IANA invalido/,
    );
  });
});

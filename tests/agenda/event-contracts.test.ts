import assert from "node:assert/strict";
import test from "node:test";
import { addUtcMonths, isMaterialChange, uniquePeople } from "../../src/modules/agenda/eventos/helpers.js";
import { cancelSchema, eventDetailQuerySchema, eventPayloadSchema, eventUpdateSchema } from "../../src/modules/agenda/eventos/schemas.js";
import { attendanceSchema, responseSchema } from "../../src/modules/agenda/ocorrencias/schemas.js";

const base = {
  title: "Culto de celebração",
  color: "#2563EB",
  startsAt: "2026-11-20T22:00:00.000Z",
  endsAt: "2026-11-21T00:00:00.000Z",
  locationType: "EXTERNO" as const,
  externalLocationName: "Auditório",
};

test("evento aceita intervalo que atravessa a meia-noite", () => {
  const parsed = eventPayloadSchema.parse(base);
  assert.equal(parsed.endsAt.toISOString(), "2026-11-21T00:00:00.000Z");
});

test("evento rejeita término anterior ao início", () => {
  assert.throws(() => eventPayloadSchema.parse({ ...base, endsAt: base.startsAt }));
});

test("recorrência semanal exige dias", () => {
  assert.throws(() => eventPayloadSchema.parse({ ...base, recurrence: { frequency: "WEEKLY", startsAtLocal: "2026-11-20T22:00" } }));
});

test("edição de ocorrência exige occurrenceId", () => {
  assert.throws(() => eventUpdateSchema.parse({ scope: "THIS", title: "Outro título" }));
});

test("edição de série permite remover a recorrência explicitamente", () => {
  const parsed = eventUpdateSchema.parse({ scope: "SERIES", recurrence: null });
  assert.equal(parsed.recurrence, null);
});

test("detalhe aceita selecionar uma ocorrência da série", () => {
  const occurrenceId = "cm12345678901234567890123";
  assert.equal(eventDetailQuerySchema.parse({ occurrenceId }).occurrenceId, occurrenceId);
});

test("cancelamento usa série como escopo padrão", () => {
  assert.equal(cancelSchema.parse({}).scope, "SERIES");
});

test("convocação pode registrar justificativa e ciência", () => {
  const parsed = responseSchema.parse({ response: "NAO_VOU", acknowledged: true, justification: "Viagem" });
  assert.equal(parsed.justification, "Viagem");
});

test("presença aceita membro não previamente convidado", () => {
  const parsed = attendanceSchema.parse({ items: [{ personId: "cm12345678901234567890123", status: "PRESENTE" }] });
  assert.equal(parsed.items.length, 1);
});

test("deduplica pessoas mantendo a última seleção", () => {
  const result = uniquePeople([{ personId: "a", type: "CONVIDADO" }, { personId: "a", type: "CONVOCADO" }]);
  assert.deepEqual(result, [{ personId: "a", type: "CONVOCADO" }]);
});

test("mudanças de data e local são materiais, texto não", () => {
  assert.equal(isMaterialChange({ startsAt: new Date() }), true);
  assert.equal(isMaterialChange({ title: "Novo" }), false);
});

test("horizonte soma doze meses em UTC", () => {
  assert.equal(addUtcMonths(new Date("2026-11-20T10:00:00Z"), 12).toISOString(), "2027-11-20T10:00:00.000Z");
});

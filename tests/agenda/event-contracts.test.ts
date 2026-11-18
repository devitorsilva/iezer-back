import assert from "node:assert/strict";
import test from "node:test";
import { addUtcMonths, isMaterialChange, uniquePeople } from "../../src/modules/agenda/eventos/helpers.js";
import { cancelSchema, eventDetailQuerySchema, eventPayloadSchema, eventUpdateSchema } from "../../src/modules/agenda/eventos/schemas.js";
import { attendanceSchema, responseSchema } from "../../src/modules/agenda/ocorrencias/schemas.js";
import * as eventHelpers from "../../src/modules/agenda/eventos/helpers.js";
import * as occurrenceService from "../../src/modules/agenda/ocorrencias/service.js";

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

test("edição de série rejeita intervalo vazio ou invertido", () => {
  assert.equal(eventUpdateSchema.safeParse({
    scope: "SERIES",
    startsAt: "2026-11-20T22:00:00.000Z",
    endsAt: "2026-11-20T22:00:00.000Z",
  }).success, false);
});

test("detalhe aceita selecionar uma ocorrência da série", () => {
  const occurrenceId = "cm12345678901234567890123";
  assert.equal(eventDetailQuerySchema.parse({ occurrenceId }).occurrenceId, occurrenceId);
});

test("cancelamento usa série como escopo padrão", () => {
  assert.equal(cancelSchema.parse({}).scope, "SERIES");
});

test("cancelamento parcial exige occurrenceId", () => {
  assert.equal(cancelSchema.safeParse({ scope: "THIS" }).success, false);
  assert.equal(cancelSchema.safeParse({ scope: "THIS_AND_FUTURE" }).success, false);
  assert.equal(cancelSchema.safeParse({ scope: "SERIES" }).success, true);
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

test("privacidade NOMES não expõe respostas, escala ou presença", () => {
  const api = eventHelpers as unknown as {
    agendaVisibility: (role: string, visibility: string) => { showNames: boolean; showResponses: boolean; showManagementData: boolean };
  };
  assert.deepEqual(api.agendaVisibility?.("PARTICIPANT", "NOMES"), {
    showNames: true,
    showResponses: false,
    showManagementData: false,
  });
});

test("líder visualiza dados de gestão independentemente da privacidade", () => {
  const api = eventHelpers as unknown as {
    agendaVisibility: (role: string, visibility: string) => { showNames: boolean; showResponses: boolean; showManagementData: boolean };
  };
  assert.deepEqual(api.agendaVisibility?.("LEADER", "SOMENTE_LIDERES"), {
    showNames: true,
    showResponses: true,
    showManagementData: true,
  });
});

test("mudança de início mantém RRULE sincronizada no timezone da série", () => {
  const api = eventHelpers as unknown as {
    recurrenceWithStart: (rrule: string, startsAt: Date, timezone: string) => string;
  };
  const updated = api.recurrenceWithStart?.(
    JSON.stringify({ frequency: "WEEKLY", interval: 1, weekdays: ["FR"], startsAtLocal: "2026-11-20T19:00" }),
    new Date("2026-11-27T23:30:00.000Z"),
    "America/Sao_Paulo",
  );
  assert.equal(JSON.parse(updated).startsAtLocal, "2026-11-27T20:30:00");
});

test("reconciliação de local externo libera todos os espaços", () => {
  const api = eventHelpers as unknown as {
    reservationSpacePlan: (current: string[], requested: string[] | undefined, locationType: string) => { keep: string[]; add: string[]; release: string[] };
  };
  assert.deepEqual(api.reservationSpacePlan?.(["salao", "apoio"], undefined, "EXTERNO"), {
    keep: [], add: [], release: ["salao", "apoio"],
  });
});

test("reconciliação de espaços calcula inclusões e liberações", () => {
  const api = eventHelpers as unknown as {
    reservationSpacePlan: (current: string[], requested: string[] | undefined, locationType: string) => { keep: string[]; add: string[]; release: string[] };
  };
  assert.deepEqual(api.reservationSpacePlan?.(["salao", "apoio"], ["apoio", "cozinha"], "INTERNO"), {
    keep: ["apoio"], add: ["cozinha"], release: ["salao"],
  });
});

test("detecta somente participantes adicionados na edição", () => {
  const api = eventHelpers as unknown as {
    addedParticipantIds: (before: string[], after: string[]) => string[];
  };
  assert.deepEqual(api.addedParticipantIds?.(["ana", "bruno"], ["bruno", "carla", "carla"]), ["carla"]);
});

test("notifica participante promovido de convidado para convocado", () => {
  const api = eventHelpers as unknown as {
    participantNotificationIds: (
      before: Array<{ personId: string; type: string }>,
      after: Array<{ personId: string; type: string }>,
    ) => string[];
  };
  assert.deepEqual(api.participantNotificationIds?.(
    [{ personId: "ana", type: "CONVIDADO" }, { personId: "bruno", type: "CONVOCADO" }],
    [{ personId: "ana", type: "CONVOCADO" }, { personId: "bruno", type: "CONVOCADO" }, { personId: "carla", type: "CONVIDADO" }],
  ), ["ana", "carla"]);
});

test("reconcilia lembretes removidos e adicionados sem duplicidade", () => {
  const api = eventHelpers as unknown as {
    reminderPlan: (current: number[], requested: number[]) => { keep: number[]; add: number[]; remove: number[] };
  };
  assert.deepEqual(api.reminderPlan?.([1440, 60], [60, 15, 15]), {
    keep: [60], add: [15], remove: [1440],
  });
});

test("somente evento publicado pode ser concluído", () => {
  const api = eventHelpers as unknown as { assertCompletableStatus: (status: string) => void };
  assert.doesNotThrow(() => api.assertCompletableStatus?.("PUBLICADO"));
  assert.throws(() => api.assertCompletableStatus?.("RASCUNHO"), /Somente eventos publicados/);
  assert.throws(() => api.assertCompletableStatus?.("CANCELADO"), /Somente eventos publicados/);
});

test("membro só pode responder a uma escala que já existe para ele", () => {
  const api = occurrenceService as unknown as {
    canSelfRespondToScale: (input: { manager: boolean; actorPersonId: string | null; items: Array<{ personId: string; status: string }>; existingPersonIds: string[] }) => boolean;
  };
  assert.equal(api.canSelfRespondToScale?.({
    manager: false,
    actorPersonId: "membro-1",
    items: [{ personId: "membro-1", status: "ACEITO" }],
    existingPersonIds: [],
  }), false);
  assert.equal(api.canSelfRespondToScale?.({
    manager: false,
    actorPersonId: "membro-1",
    items: [{ personId: "membro-1", status: "ACEITO" }],
    existingPersonIds: ["membro-1"],
  }), true);
});

test("convocado não pode responder TALVEZ", () => {
  const api = occurrenceService as unknown as {
    validateParticipantResponse: (type: string, response: string, acknowledged: boolean, justification?: string) => void;
  };
  assert.throws(
    () => api.validateParticipantResponse?.("CONVOCADO", "TALVEZ", true),
    /Convocado deve responder VOU ou NÃO VOU/,
  );
});

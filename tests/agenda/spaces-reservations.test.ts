import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { shouldPhysicallyDelete } from "../../src/modules/agenda/espacos/service.js";
import { reservationPayloadSchema, reservationQuerySchema } from "../../src/modules/agenda/reservas/schemas.js";
import { calculateEffectiveInterval, isReservationConstraintError, partitionReservationGroup, resolveReservationGroupId } from "../../src/modules/agenda/reservas/service.js";

test("espaço sem histórico pode ser excluído e com histórico deve ser desativado", () => {
  assert.equal(shouldPhysicallyDelete(0), true);
  assert.equal(shouldPhysicallyDelete(1), false);
});

test("payload de reserva deduplica espaços e converte instantes com offset para UTC", () => {
  const value = reservationPayloadSchema.parse({
    title: "Manutenção do salão",
    spaceIds: ["salao", "salao", "apoio"],
    startsAt: "2026-11-16T20:00:00-03:00",
    endsAt: "2026-11-16T22:00:00-03:00",
  });
  assert.deepEqual(value.spaceIds, ["salao", "apoio"]);
  assert.equal(value.startsAt.toISOString(), "2026-11-16T23:00:00.000Z");
  assert.equal(value.endsAt.toISOString(), "2026-11-17T01:00:00.000Z");
});

test("payload rejeita intervalo vazio ou invertido", () => {
  const result = reservationPayloadSchema.safeParse({
    title: "Montagem",
    spaceIds: ["salao"],
    startsAt: "2026-11-16T22:00:00Z",
    endsAt: "2026-11-16T22:00:00Z",
  });
  assert.equal(result.success, false);
});

test("filtro rejeita período invertido", () => {
  assert.equal(reservationQuerySchema.safeParse({ from: "2026-11-17T00:00:00Z", to: "2026-11-16T00:00:00Z" }).success, false);
});

test("buffers ampliam o intervalo efetivo sem alterar o intervalo informado", () => {
  const startsAt = new Date("2026-11-16T20:00:00Z");
  const endsAt = new Date("2026-11-16T22:00:00Z");
  const effective = calculateEffectiveInterval(startsAt, endsAt, 30, 45);
  assert.equal(effective.effectiveStartsAt.toISOString(), "2026-11-16T19:30:00.000Z");
  assert.equal(effective.effectiveEndsAt.toISOString(), "2026-11-16T22:45:00.000Z");
  assert.equal(startsAt.toISOString(), "2026-11-16T20:00:00.000Z");
});

test("somente a constraint de sobreposição P2004 é traduzida como conflito de reserva", () => {
  const overlap = new Prisma.PrismaClientKnownRequestError("overlap", {
    code: "P2004",
    clientVersion: "6.14.0",
    meta: { database_error: "AgendaReservation_no_active_overlap" },
  });
  const other = new Prisma.PrismaClientKnownRequestError("check", {
    code: "P2004",
    clientVersion: "6.14.0",
    meta: { database_error: "AgendaReservation_valid_interval" },
  });
  assert.equal(isReservationConstraintError(overlap), true);
  assert.equal(isReservationConstraintError(other), false);
  assert.equal(isReservationConstraintError(new Error("overlap")), false);
});

test("reserva usa groupId e mantém compatibilidade com linhas legadas", () => {
  assert.equal(resolveReservationGroupId({ id: "reserva-1", groupId: "grupo-1" } as never), "grupo-1");
  assert.equal(resolveReservationGroupId({ id: "reserva-legada", groupId: null } as never), "reserva-legada");
});

test("edição reconcilia todos os espaços do grupo atomicamente", () => {
  const changes = partitionReservationGroup(
    [{ id: "a", spaceId: "salao" }, { id: "b", spaceId: "apoio" }],
    [{ spaceId: "apoio", title: "novo" }, { spaceId: "cozinha", title: "novo" }],
  );
  assert.deepEqual(changes.retained, [{ existing: { id: "b", spaceId: "apoio" }, desired: { spaceId: "apoio", title: "novo" } }]);
  assert.deepEqual(changes.added, [{ spaceId: "cozinha", title: "novo" }]);
  assert.deepEqual(changes.removed, [{ id: "a", spaceId: "salao" }]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { agendaEventRoutes } from "../../src/modules/agenda/eventos/routes.js";
import { agendaOccurrenceRoutes } from "../../src/modules/agenda/ocorrencias/routes.js";

type Route = { method: string; path: string; options: Record<string, unknown> };

function routeRecorder() {
  const routes: Route[] = [];
  const app = Object.fromEntries(["get", "post", "patch", "put", "delete"].map((method) => [method, (
    path: string,
    options: Record<string, unknown> | ((...args: unknown[]) => unknown),
  ) => routes.push({ method: method.toUpperCase(), path, options: typeof options === "function" ? {} : options })]));
  return { app, routes };
}

test("rotas delegadas não exigem agenda.ver no preHandler", async () => {
  const events = routeRecorder();
  await agendaEventRoutes(events.app as never, {} as never);
  const occurrences = routeRecorder();
  await agendaOccurrenceRoutes(occurrences.app as never, {} as never);

  for (const route of [...events.routes, ...occurrences.routes]) {
    if (route.method === "POST" && route.path === "/eventos") continue;
    assert.equal(route.options.preHandler, undefined, `${route.method} ${route.path} ainda possui bloqueio global`);
  }
});

test("eventos publicados possuem endpoint de conclusão", async () => {
  const recorder = routeRecorder();
  await agendaEventRoutes(recorder.app as never, {} as never);
  assert.ok(recorder.routes.some((route) => route.method === "POST" && route.path === "/eventos/:id/concluir"));
});

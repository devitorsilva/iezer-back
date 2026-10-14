import type { ModuleKey } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import { runAudited } from "../../../lib/audit.js";
import { screenLabel } from "../../../lib/support-log.js";
import { AuditRepository, type AuditRow, type AuditScope } from "./repository.js";
import {
  ACTOR_TYPE_LABELS,
  MODULE_LABELS,
  actionLabel,
  describeChanges,
  formatDateTime,
  targetTypeLabel,
} from "./rotulos.js";
import type { AuditFilters, AuditListQuery, PersonHistoryQuery } from "./schemas.js";

export const EXPORT_LIMIT = 10_000;

export class PersonNotFoundError extends Error {}

// Ações que registram leitura, não alteração (acesso do suporte; depois, leitura de notas pastorais).
// A aba Histórico mostra quem alterou a pessoa; quem a acessou fica na Auditoria (RF-LP04), que
// exige "Ver log de auditoria".
export const READ_ACTIONS = ["suporte_ler"];

function snapshotName(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["name", "personName", "description", "email"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return null;
}

function actorName(row: AuditRow) {
  if (row.actorType === "SUPORTE") return row.actorUser ? `Suporte iEzer (${row.actorUser.name})` : "Suporte iEzer";
  if (row.actorType === "SISTEMA") return "Sistema";
  return row.actorUser?.name ?? "Não identificado";
}

function mapRow(row: AuditRow, targetLabels: Map<string, string>, personNames: Map<string, string>) {
  // Pessoa sem nome: registro apagado depois (o log sobrevive).
  const people = row.personIds.map((id) => ({ id, name: personNames.get(id) ?? null }));
  const targetLabel =
    (row.targetType && row.targetId ? targetLabels.get(`${row.targetType}:${row.targetId}`) : undefined) ??
    snapshotName(row.before) ??
    snapshotName(row.after) ??
    (row.targetType === "FollowUp" || row.targetType === "PersonConsent" ? (people[0]?.name ?? null) : null);

  // Leitura do suporte: a pessoa aberta (quando há) e o nome da tela no lugar de "Tela ou registro".
  const screen = row.targetType === "Rota" ? screenLabel(row.description) : null;

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actor: { type: row.actorType, userId: row.actorUserId, name: actorName(row) },
    organization: row.organization,
    module: row.module,
    moduleLabel: MODULE_LABELS[row.module],
    action: row.action,
    actionLabel: actionLabel(row.action),
    targetType: row.targetType,
    targetTypeLabel: screen ? (people[0]?.name ? screen : "Tela") : targetTypeLabel(row.targetType),
    targetId: row.targetId,
    targetLabel: screen ? (people[0]?.name ?? screen) : targetLabel,
    people,
    changes: describeChanges(row.before, row.after),
    description: row.description,
    ip: row.ip,
    userAgent: row.userAgent,
  };
}

export type AuditEntryDto = ReturnType<typeof mapRow>;

// Planilha: `;` e BOM para o Excel em português; célula que começa com = + - @ ganha
// apóstrofo (injeção de fórmula).
function csvCell(value: string | null | undefined) {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const CSV_HEADER = [
  "Data e hora",
  "Autor",
  "Tipo de autor",
  "Organização",
  "Módulo",
  "Ação",
  "Tipo de registro",
  "Registro",
  "Pessoas afetadas",
  "Alterações",
  "Descrição",
  "IP",
  "Dispositivo",
];

function toCsvLine(entry: AuditEntryDto) {
  const changes = entry.changes
    .map((change) =>
      change.before === null
        ? `${change.label}: ${change.after}`
        : change.after === null
          ? `${change.label}: ${change.before}`
          : `${change.label}: ${change.before} → ${change.after}`,
    )
    .join(" | ");

  return [
    formatDateTime(new Date(entry.createdAt)),
    entry.actor.name,
    ACTOR_TYPE_LABELS[entry.actor.type],
    entry.organization?.name,
    entry.moduleLabel,
    entry.actionLabel,
    entry.targetTypeLabel,
    entry.targetLabel,
    entry.people.map((person) => person.name ?? "Registro apagado").join(", "),
    changes,
    entry.description,
    entry.ip,
    entry.userAgent,
  ]
    .map(csvCell)
    .join(";");
}

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  churchOrganizations(churchId: string) {
    return this.repository.churchOrganizations(churchId);
  }

  async list(scope: AuditScope, query: AuditListQuery) {
    const { items, total } = await this.repository.list(scope, query, query.page, query.pageSize);
    return { items: await this.mapRows(items), total, page: query.page, pageSize: query.pageSize };
  }

  // Aba Histórico (pessoas.historico.ver): só o módulo Pessoas, nas organizações da igreja.
  // O histórico completo da pessoa fica na Auditoria (RF-LP04).
  async personHistory(context: RequestContext, personId: string, query: PersonHistoryQuery) {
    if (!(await this.repository.personExists(personId, context.readOrganizationIds))) {
      throw new PersonNotFoundError();
    }

    const organizations = await this.repository.churchOrganizations(context.churchId);
    return this.list(
      { organizationIds: organizations.map((org) => org.id), module: "PESSOAS", excludeActions: READ_ACTIONS },
      { ...query, pessoa: personId },
    );
  }

  async filterOptions(churchId: string, organizationIds: string[]) {
    const [organizations, { actions, users }] = await Promise.all([
      this.repository.churchOrganizations(churchId),
      this.repository.filterOptions(organizationIds),
    ]);

    const collator = new Intl.Collator("pt-BR");
    const modules = [...new Set(actions.map((item) => item.module))]
      .map((module) => ({ value: module, label: MODULE_LABELS[module] }))
      .sort((a, b) => collator.compare(a.label, b.label));

    // Mesma ação em módulos diferentes (ex.: "criar") vira uma opção só.
    const actionModules = new Map<string, Set<ModuleKey>>();
    for (const item of actions) {
      const set = actionModules.get(item.action) ?? new Set<ModuleKey>();
      set.add(item.module);
      actionModules.set(item.action, set);
    }

    return {
      organizations: organizations
        .filter((org) => organizationIds.includes(org.id))
        .sort((a, b) => Number(a.type === "CONGREGACAO") - Number(b.type === "CONGREGACAO"))
        .map((org) => ({ id: org.id, name: org.name, type: org.type, isActive: org.isActive })),
      modules,
      actions: [...actionModules]
        .map(([action, set]) => ({ value: action, label: actionLabel(action), modules: [...set] }))
        .sort((a, b) => collator.compare(a.label, b.label)),
      authors: users.map((user) => ({ id: user.id, name: user.name, email: user.email })),
    };
  }

  // Exportação registrada no próprio log (RF-LP02), antes de a planilha sair.
  async export(context: RequestContext, scope: AuditScope, filters: AuditFilters) {
    const rows = await this.repository.findForExport(scope, filters, EXPORT_LIMIT);
    const truncated = rows.length > EXPORT_LIMIT;
    const entries = await this.mapRows(rows.slice(0, EXPORT_LIMIT));

    await runAudited(context.actor, (_tx, audit) =>
      audit({
        organizationId: context.writeOrganizationId ?? context.churchId,
        module: "ACESSO",
        action: "exportar_auditoria",
        targetType: "AuditLog",
        after: { filters, rows: entries.length, truncated },
      }),
    );

    const csv = `﻿${[CSV_HEADER.join(";"), ...entries.map(toCsvLine)].join("\r\n")}\r\n`;
    return { csv, truncated, rows: entries.length };
  }

  private async mapRows(rows: AuditRow[]) {
    const [targetLabels, personNames] = await Promise.all([
      this.repository.targetLabels(rows),
      this.repository.personNames([...new Set(rows.flatMap((row) => row.personIds))]),
    ]);
    return rows.map((row) => mapRow(row, targetLabels, personNames));
  }
}

import type { ModuleKey } from "@prisma/client";
import { screenLabel } from "../../../lib/support-log.js";
import type { AuditRow } from "../../acesso/auditoria/repository.js";
import { actionLabel } from "../../acesso/auditoria/rotulos.js";
import { auditService } from "../../acesso/auditoria/routes.js";
import type { AuditEntryDto } from "../../acesso/auditoria/service.js";
import { ChurchAdminNotFoundError } from "../igrejas/service.js";
import type { InternalAuditFilters, InternalAuditRepository } from "./repository.js";
import type { ChurchHistoryQuery, InternalAuditQuery } from "./schemas.js";

// Módulos com dados da igreja: a equipe só mexe neles no modo suporte. Na auditoria interna e no
// Histórico da igreja, a linha diz o que foi feito e em que tipo de registro, sem nome de pessoa,
// alterações nem pessoas afetadas (B8): o detalhe fica na Auditoria da igreja.
const DATA_MODULES = new Set<ModuleKey>(["PESSOAS", "FINANCEIRO", "CADASTRO", "MEMBROS"]);
const SUPPORT_READ = "suporte_ler";

function redact(entry: AuditEntryDto, row: AuditRow) {
  const isRead = row.action === SUPPORT_READ;
  if (!isRead && !DATA_MODULES.has(row.module)) return { ...entry, peopleCount: entry.people.length, redacted: false };

  return {
    ...entry,
    targetTypeLabel: isRead ? "Tela" : entry.targetTypeLabel,
    targetLabel: isRead ? screenLabel(row.description) : null,
    description: isRead ? null : entry.description,
    people: [],
    peopleCount: entry.people.length,
    changes: [],
    redacted: true,
  };
}

export class InternalAuditService {
  constructor(private readonly repository: InternalAuditRepository) {}

  async list(query: InternalAuditQuery) {
    const organizationIds = query.igreja ? await this.repository.churchOrganizationIds(query.igreja) : undefined;
    return this.page("interna", { ...this.filters(query), organizationIds }, query);
  }

  async churchHistory(churchId: string, query: ChurchHistoryQuery) {
    if (!(await this.repository.churchExists(churchId))) throw new ChurchAdminNotFoundError("church");
    const organizationIds = await this.repository.churchOrganizationIds(churchId);
    return this.page("igreja", { ...this.filters(query), organizationIds }, query);
  }

  async filterOptions() {
    const options = await this.repository.filterOptions(this.repository.where("interna", {}));
    const collator = new Intl.Collator("pt-BR");
    return {
      members: options.members,
      churches: options.churches,
      actions: options.actions
        .map((action) => ({ value: action, label: actionLabel(action) }))
        .sort((a, b) => collator.compare(a.label, b.label)),
    };
  }

  private filters(query: InternalAuditQuery | ChurchHistoryQuery): InternalAuditFilters {
    return { actorUserId: query.membro, action: query.acao, from: query.de, to: query.ate };
  }

  private async page(scope: "interna" | "igreja", filters: InternalAuditFilters, query: { page: number; pageSize: number }) {
    const { items, total } = await this.repository.list(this.repository.where(scope, filters), query.page, query.pageSize);
    const entries = await auditService.mapRows(items);
    return {
      items: entries.map((entry, index) => redact(entry, items[index]!)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}

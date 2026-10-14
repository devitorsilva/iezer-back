import type { FastifyReply, FastifyRequest } from "fastify";
import { getChurchId, getRequestContext, organizationIdsWith } from "../../../lib/access.js";
import { todayCivil } from "../../../lib/civil-date.js";
import { personParamsSchema } from "../../pessoas/pessoas/schemas.js";
import { PersonNotFoundError, type AuditService } from "./service.js";
import { auditFiltersSchema, auditListQuerySchema, personHistoryQuerySchema } from "./schemas.js";

export class AuditController {
  constructor(private readonly service: AuditService) {}

  // Com "Ver log de auditoria" na sede: a igreja toda, inclusive congregações desativadas.
  // Só numa congregação: o log dela.
  private async organizationIds(request: FastifyRequest) {
    const churchId = getChurchId(request);
    const church = request.access.organizations.find((org) => org.id === churchId);

    if (church?.permissions.has("auditoria.ver")) {
      return (await this.service.churchOrganizations(churchId)).map((org) => org.id);
    }
    return organizationIdsWith(request, "auditoria.ver");
  }

  list = async (request: FastifyRequest) => {
    const query = auditListQuerySchema.parse(request.query);
    return this.service.list({ organizationIds: await this.organizationIds(request) }, query);
  };

  filters = async (request: FastifyRequest) => {
    return this.service.filterOptions(getChurchId(request), await this.organizationIds(request));
  };

  export = async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = auditFiltersSchema.parse(request.query);
    const { csv, truncated, rows } = await this.service.export(
      getRequestContext(request),
      { organizationIds: await this.organizationIds(request) },
      filters,
    );

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="auditoria-${todayCivil()}.csv"`)
      .header("X-Export-Rows", String(rows))
      .header("X-Export-Truncated", String(truncated))
      .header("Access-Control-Expose-Headers", "Content-Disposition, X-Export-Rows, X-Export-Truncated")
      .send(csv);
  };

  // GET /pessoas/:id/historico (aba Histórico do perfil).
  personHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = personParamsSchema.parse(request.params);
    const query = personHistoryQuerySchema.parse(request.query);

    try {
      return await this.service.personHistory(getRequestContext(request), id, query);
    } catch (error) {
      if (error instanceof PersonNotFoundError) return reply.notFound("Pessoa não encontrada.");
      throw error;
    }
  };
}

import { Prisma, type Person } from "@prisma/client";
import { requireWriteOrganization, type RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry } from "../../../lib/audit.js";
import { formatCivilDate } from "../../../lib/civil-date.js";
import { isValidCpf, normalizeCpf } from "../../../lib/cpf.js";
import { AppError } from "../../../lib/errors.js";
import { normalizePhone } from "../../../lib/phone.js";
import { normalizeSearchText } from "../../../lib/text.js";
import { isMinor } from "../../pessoas/pessoas/rules.js";
import { PersonNotFoundError, type PersonService } from "../../pessoas/pessoas/service.js";
import type { MemberRepository } from "./repository.js";
import type { MemberPayload } from "./schemas.js";

// Compatibilidade do formato antigo (/cadastro/membros) sobre Person, até a Sprint 5.
// Cadastro novo entra como Membro (como os migrados); menor de idade só por /pessoas.

export class MemberNotFoundError extends Error {
  constructor() {
    super("MEMBER_NOT_FOUND");
  }
}

export class MemberDocumentConflictError extends Error {
  constructor() {
    super("MEMBER_DOCUMENT_CONFLICT");
  }
}

function mapMember(person: Person) {
  return {
    id: person.id,
    organizationId: person.organizationId,
    name: person.name,
    document: person.cpf ?? person.otherDocumentNumber,
    email: person.email,
    phone: person.mobilePhone,
    cellName: person.cellName,
    birthDate: formatCivilDate(person.birthDate),
    notes: person.notes,
    isActive: person.status === "ATIVO",
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

type MemberDto = ReturnType<typeof mapMember>;

function auditEntry(
  action: string,
  organizationId: string,
  targetId: string,
  data: { before?: MemberDto; after?: MemberDto },
): AuditEntry {
  return { organizationId, module: "PESSOAS", action, targetType: "Person", targetId, ...data };
}

function toPersonData(payload: MemberPayload) {
  if (isMinor(payload.birthDate)) {
    throw new AppError(
      400,
      "GUARDIAN_REQUIRED",
      "Menor de 18 anos precisa de responsável e consentimento: cadastre pelo módulo Pessoas.",
    );
  }

  const digits = payload.document ? normalizeCpf(payload.document) : "";
  const cpf = isValidCpf(digits) ? digits : null;
  const mobilePhone = payload.phone ? normalizePhone(payload.phone) : null;
  if (payload.phone && !mobilePhone) throw new AppError(400, "VALIDATION_ERROR", "Telefone inválido. Informe DDD e número.");

  return {
    name: payload.name,
    searchName: normalizeSearchText(payload.name),
    cpf,
    otherDocumentType: !cpf && payload.document ? ("OUTRO" as const) : null,
    otherDocumentNumber: !cpf && payload.document ? payload.document : null,
    email: payload.email?.toLowerCase() ?? null,
    mobilePhone,
    cellName: payload.cellName ?? null,
    birthDate: payload.birthDate ?? null,
    notes: payload.notes ?? null,
  };
}

export class MemberService {
  constructor(
    private readonly repository: MemberRepository,
    private readonly people: PersonService,
  ) {}

  async list(context: RequestContext) {
    const items = await this.repository.findAll(context.readOrganizationIds);
    return items.map(mapMember);
  }

  async getById(context: RequestContext, id: string) {
    const member = await this.repository.findById(id, context.readOrganizationIds);
    if (!member) throw new MemberNotFoundError();
    return mapMember(member);
  }

  async create(context: RequestContext, payload: MemberPayload) {
    const organizationId = requireWriteOrganization(context);
    const data = toPersonData(payload);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        if (data.cpf && (await this.repository.findByCpf(data.cpf, context.readOrganizationIds, null, tx))) {
          throw new MemberDocumentConflictError();
        }

        const created = mapMember(
          await this.repository.create(
            { ...data, organizationId, bond: "MEMBRO", status: payload.isActive ? "ATIVO" : "INATIVO" },
            tx,
          ),
        );
        await audit(auditEntry("criar", organizationId, created.id, { after: created }));
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MemberDocumentConflictError();
      }
      throw error;
    }
  }

  async update(context: RequestContext, id: string, payload: MemberPayload) {
    const data = toPersonData(payload);

    try {
      return await runAudited(context.actor, async (tx, audit) => {
        const existing = await this.repository.findById(id, context.readOrganizationIds, tx);
        if (!existing) throw new MemberNotFoundError();
        if (data.cpf && (await this.repository.findByCpf(data.cpf, context.readOrganizationIds, id, tx))) {
          throw new MemberDocumentConflictError();
        }

        // O switch "ativo" antigo só alterna entre Ativo e Inativo.
        const status =
          existing.status === "ATIVO" || existing.status === "INATIVO"
            ? payload.isActive
              ? "ATIVO"
              : "INATIVO"
            : existing.status;

        const updated = mapMember(await this.repository.update(id, { ...data, status }, tx));
        await audit(
          auditEntry("editar", existing.organizationId, id, { before: mapMember(existing), after: updated }),
        );
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MemberDocumentConflictError();
      }
      throw error;
    }
  }

  // Mesmas regras de "Apagar registro" de /pessoas (sem vínculos).
  async remove(context: RequestContext, id: string) {
    try {
      await this.people.remove(context, id);
    } catch (error) {
      if (error instanceof PersonNotFoundError) throw new MemberNotFoundError();
      throw error;
    }
  }
}

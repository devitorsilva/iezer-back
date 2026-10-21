import type { OrganizationContact, Prisma } from "@prisma/client";
import type { RequestContext } from "../../lib/access.js";
import { runAudited } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { slugify } from "../../lib/text.js";
import type { ChurchWithRelations, OrganizationRepository } from "./repository.js";
import type {
  AccountOwnerContactInput,
  CreateCongregationInput,
  LgpdOfficerInput,
  UpdateChurchInput,
  UpdateCongregationInput,
} from "./schemas.js";

type Db = Prisma.TransactionClient;

// Igreja e autor: vem do app das igrejas (RequestContext) ou do back-office da equipe.
export type OrganizationContext = Pick<RequestContext, "churchId" | "actor">;

export class CongregationNotFoundError extends Error {
  constructor() {
    super("CONGREGATION_NOT_FOUND");
  }
}

function mapContact(contact: OrganizationContact | undefined) {
  if (!contact) return null;
  return {
    name: contact.name,
    jobTitle: contact.jobTitle,
    email: contact.email,
    phone: contact.phone,
  };
}

function mapCongregation(organization: { id: string; name: string; isActive: boolean; createdAt: Date }) {
  return {
    id: organization.id,
    name: organization.name,
    isActive: organization.isActive,
    createdAt: organization.createdAt.toISOString(),
  };
}

function mapChurch(church: ChurchWithRelations) {
  return {
    id: church.id,
    name: church.name,
    cnpj: church.cnpj,
    congregationsReviewedAt: church.congregationsReviewedAt?.toISOString() ?? null,
    congregations: church.children.map(mapCongregation),
    // Somente leitura: para trocar, fale com o iEzer (RF-OR03).
    accountOwner: mapContact(church.contacts.find((contact) => contact.role === "RESPONSAVEL_CONTA")),
    lgpdOfficer: mapContact(church.contacts.find((contact) => contact.role === "ENCARREGADO_LGPD")),
  };
}

// CNPJ é único entre as sedes (RF-BO14). churchId: a outra igreja, para o link do back-office.
export function cnpjTakenError(churchId: string) {
  return new AppError(409, "CHURCH_CNPJ_TAKEN", "Já existe uma igreja com este CNPJ.", { field: "cnpj", churchId });
}

// Configurações › Organização (RF-OR01, RF-OR03). Dois níveis: congregações só sob a sede (RF-OR02).
// Congregação não é apagada, só desativada: dados e histórico continuam ligados a ela.
export class OrganizationService {
  constructor(private readonly repository: OrganizationRepository) {}

  async get(churchId: string) {
    return mapChurch(await this.findChurchOrThrow(churchId));
  }

  async updateChurch(context: OrganizationContext, input: UpdateChurchInput) {
    return runAudited(context.actor, async (tx, audit) => {
      const church = await this.findChurchOrThrow(context.churchId, tx);

      if (input.name && (await this.repository.nameTaken(church.id, input.name, church.id, tx))) {
        throw this.nameTakenError();
      }

      if (input.cnpj && input.cnpj !== church.cnpj) {
        const other = await this.repository.findChurchByCnpj(input.cnpj, tx);
        if (other) throw cnpjTakenError(other.id);
      }

      await this.repository.updateOrganization(church.id, { name: input.name, cnpj: input.cnpj }, tx);

      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "editar_sede",
        targetType: "Organization",
        targetId: church.id,
        before: { name: church.name, cnpj: church.cnpj },
        after: { name: input.name ?? church.name, cnpj: input.cnpj === undefined ? church.cnpj : input.cnpj },
      });

      return mapChurch((await this.repository.findChurch(church.id, tx))!);
    });
  }

  async createCongregation(context: OrganizationContext, input: CreateCongregationInput) {
    return runAudited(context.actor, async (tx, audit) => {
      const church = await this.findChurchOrThrow(context.churchId, tx);

      if (await this.repository.nameTaken(church.id, input.name, undefined, tx)) {
        throw this.nameTakenError();
      }

      const created = await this.repository.createCongregation(
        { churchId: church.id, name: input.name, slug: await this.uniqueSlug(church.slug, input.name, tx) },
        tx,
      );

      await audit({
        organizationId: created.id,
        module: "CONFIGURACOES",
        action: "criar_congregacao",
        targetType: "Organization",
        targetId: created.id,
        after: mapCongregation(created),
      });

      return mapCongregation(created);
    });
  }

  async updateCongregation(context: OrganizationContext, id: string, input: UpdateCongregationInput) {
    return runAudited(context.actor, async (tx, audit) => {
      const current = await this.repository.findCongregation(id, context.churchId, tx);
      if (!current) throw new CongregationNotFoundError();

      if (input.name && (await this.repository.nameTaken(context.churchId, input.name, id, tx))) {
        throw this.nameTakenError();
      }

      const updated = await this.repository.updateOrganization(id, { name: input.name, isActive: input.isActive }, tx);

      const action =
        input.isActive === false && current.isActive
          ? "desativar_congregacao"
          : input.isActive === true && !current.isActive
            ? "reativar_congregacao"
            : "editar_congregacao";

      await audit({
        organizationId: id,
        module: "CONFIGURACOES",
        action,
        targetType: "Organization",
        targetId: id,
        before: mapCongregation(current),
        after: mapCongregation(updated),
      });

      return mapCongregation(updated);
    });
  }

  async setLgpdOfficer(context: OrganizationContext, input: LgpdOfficerInput) {
    return runAudited(context.actor, async (tx, audit) => {
      const church = await this.findChurchOrThrow(context.churchId, tx);
      const before = mapContact(church.contacts.find((contact) => contact.role === "ENCARREGADO_LGPD"));

      const contact = await this.repository.upsertContact(
        church.id,
        "ENCARREGADO_LGPD",
        { name: input.name, jobTitle: input.jobTitle ?? null, email: input.email, phone: input.phone ?? null },
        tx,
      );

      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "editar_encarregado_lgpd",
        targetType: "OrganizationContact",
        targetId: contact.id,
        before,
        after: mapContact(contact),
      });

      return mapContact(contact);
    });
  }

  // Dados de contato do responsável pela conta, pela equipe iEzer. O nome não muda aqui: trocar o
  // responsável exige documento (RF-BO25).
  async setAccountOwnerContact(context: OrganizationContext, input: AccountOwnerContactInput) {
    return runAudited(context.actor, async (tx, audit) => {
      const church = await this.findChurchOrThrow(context.churchId, tx);
      const current = church.contacts.find((contact) => contact.role === "RESPONSAVEL_CONTA");
      if (!current) {
        throw new AppError(409, "ACCOUNT_OWNER_MISSING", "A igreja não tem responsável pela conta cadastrado.");
      }

      const contact = await this.repository.upsertContact(
        church.id,
        "RESPONSAVEL_CONTA",
        { name: current.name, jobTitle: input.jobTitle ?? null, email: input.email, phone: input.phone ?? null },
        tx,
      );

      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "editar_responsavel_conta",
        targetType: "OrganizationContact",
        targetId: contact.id,
        before: mapContact(current),
        after: mapContact(contact),
      });

      return mapContact(contact);
    });
  }

  async removeLgpdOfficer(context: OrganizationContext) {
    await runAudited(context.actor, async (tx, audit) => {
      const church = await this.findChurchOrThrow(context.churchId, tx);
      const current = church.contacts.find((contact) => contact.role === "ENCARREGADO_LGPD");
      if (!current) return;

      await this.repository.deleteContact(church.id, "ENCARREGADO_LGPD", tx);
      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "remover_encarregado_lgpd",
        targetType: "OrganizationContact",
        targetId: current.id,
        before: mapContact(current),
      });
    });
  }

  // Item "conferir congregações" do checklist de primeiro acesso (RF-OB03).
  async markCongregationsReviewed(context: OrganizationContext) {
    return runAudited(context.actor, async (tx, audit) => {
      const church = await this.findChurchOrThrow(context.churchId, tx);
      const reviewedAt = new Date();

      await this.repository.updateOrganization(church.id, { congregationsReviewedAt: reviewedAt }, tx);
      await audit({
        organizationId: church.id,
        module: "CONFIGURACOES",
        action: "conferir_congregacoes",
        targetType: "Organization",
        targetId: church.id,
        after: { congregationsReviewedAt: reviewedAt },
      });

      return { congregationsReviewedAt: reviewedAt.toISOString() };
    });
  }

  private async findChurchOrThrow(churchId: string, db?: Db) {
    const church = await this.repository.findChurch(churchId, db);
    if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Sede não encontrada.");
    return church;
  }

  private async uniqueSlug(churchSlug: string, name: string, db: Db) {
    const base = `${churchSlug}-${slugify(name) || "congregacao"}`;
    let slug = base;
    for (let suffix = 2; await this.repository.slugTaken(slug, db); suffix++) slug = `${base}-${suffix}`;
    return slug;
  }

  private nameTakenError() {
    return new AppError(409, "ORGANIZATION_NAME_TAKEN", "Já existe uma organização com esse nome nesta igreja.", {
      field: "name",
    });
  }
}

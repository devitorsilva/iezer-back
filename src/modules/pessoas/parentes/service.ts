import type { PersonRelationType, Prisma } from "@prisma/client";
import type { RequestContext } from "../../../lib/access.js";
import { runAudited, type AuditEntry, type AuditWriter } from "../../../lib/audit.js";
import { ageOn } from "../../../lib/civil-date.js";
import { AppError } from "../../../lib/errors.js";
import { PersonNotFoundError } from "../pessoas/service.js";
import type { PersonRelationRepository, RelationWithPeople, RelativePerson } from "./repository.js";
import type { RelativeCreatePayload } from "./schemas.js";

export class RelationNotFoundError extends Error {
  constructor() {
    super("RELATION_NOT_FOUND");
  }
}

type Db = Prisma.TransactionClient;

type PersonRef = Pick<RelativePerson, "id" | "name" | "organizationId">;

// Ordem em que a ficha mostra os parentes.
const KINDS = ["CONJUGE", "PAI_MAE", "FILHO", "IRMAO", "AVO", "NETO"] as const;
type RelativeKind = (typeof KINDS)[number];

interface Found {
  kind: RelativeKind;
  person: RelativePerson;
  // Laço direto (pode ser removido); os deduzidos não têm.
  relationId: string | null;
  // Por quem o deduzido chega: o pai do avô, o filho do neto.
  via: RelativePerson | null;
}

// RF-F12: de quem é de organização que o usuário não lê, só o nome e o parentesco (o sexo vem para
// dizer "pai" ou "mãe").
function mapRelative(found: Found, readOrganizationIds: string[]) {
  const { person, via } = found;
  const readable = readOrganizationIds.includes(person.organizationId);
  return {
    kind: found.kind,
    relationId: found.relationId,
    personId: person.id,
    name: person.name,
    preferredName: person.preferredName,
    sex: person.sex,
    readable,
    age: readable && person.birthDate ? ageOn(person.birthDate) : null,
    status: readable ? person.status : null,
    organizationName: readable ? person.organization.name : null,
    via: via ? { personId: via.id, name: via.name, preferredName: via.preferredName } : null,
  };
}

function relationAudit(
  action: string,
  person: PersonRef,
  relation: { id: string; personId: string; relativeId: string; type: PersonRelationType },
  data: { before?: unknown; after?: unknown },
): AuditEntry {
  return {
    organizationId: person.organizationId,
    module: "PESSOAS",
    action,
    targetType: "PersonRelation",
    targetId: relation.id,
    ...data,
    personIds: [relation.personId, relation.relativeId],
  };
}

function snapshot(relation: RelationWithPeople) {
  return {
    type: relation.type,
    personId: relation.personId,
    personName: relation.person.name,
    relativeId: relation.relativeId,
    relativeName: relation.relative.name,
  };
}

// Parentesco entre domicílios (RF-F10 a RF-F14). Só pai/mãe e cônjuge ficam gravados; irmãos, avós e
// netos saem deles.
export class PersonRelationService {
  constructor(private readonly repository: PersonRelationRepository) {}

  async list(context: RequestContext, id: string) {
    const person = await this.repository.findPerson(id, context.readOrganizationIds);
    if (!person) throw new PersonNotFoundError();
    return { items: await this.relativesOf(context, id) };
  }

  async add(context: RequestContext, id: string, payload: RelativeCreatePayload) {
    return runAudited(context.actor, async (tx, audit) => {
      const person = await this.repository.findPerson(id, context.readOrganizationIds, tx);
      if (!person) throw new PersonNotFoundError();
      if (payload.personId === id) {
        throw new AppError(400, "INVALID_RELATION", "Uma pessoa não pode ser parente de si mesma.");
      }
      const relative = await this.repository.findPerson(payload.personId, context.readOrganizationIds, tx);
      if (!relative) throw new AppError(400, "INVALID_REFERENCE", "Pessoa não encontrada.");

      const existing = await this.repository.findBetween(id, relative.id, tx);
      if (existing) {
        throw new AppError(409, "RELATION_EXISTS", `${person.name} e ${relative.name} já têm um parentesco registrado.`);
      }

      if (payload.type === "CONJUGE") {
        await this.linkSpouses(context, person, relative, tx, audit);
      } else {
        const [parent, child] = payload.type === "PAI_MAE" ? [relative, person] : [person, relative];
        await this.linkParent(context, parent, child, person, tx, audit);
      }
      return { items: await this.relativesOf(context, id, tx) };
    });
  }

  async remove(context: RequestContext, id: string, relationId: string) {
    return runAudited(context.actor, async (tx, audit) => {
      const person = await this.repository.findPerson(id, context.readOrganizationIds, tx);
      if (!person) throw new PersonNotFoundError();

      // Só desfaz laço da ficha aberta e entre pessoas que o usuário enxerga.
      const relation = await this.repository.findById(relationId, tx);
      const involves = relation && (relation.personId === id || relation.relativeId === id);
      const visible =
        relation &&
        context.readOrganizationIds.includes(relation.person.organizationId) &&
        context.readOrganizationIds.includes(relation.relative.organizationId);
      if (!relation || !involves || !visible) throw new RelationNotFoundError();

      await this.repository.delete(relationId, tx);
      await audit(relationAudit("remover_parente", person, relation, { before: snapshot(relation) }));
      return { items: await this.relativesOf(context, id, tx) };
    });
  }

  // Usado também pelo "Cadastrar filho" (RF-F13), na transação do cadastro.
  async linkParent(
    context: RequestContext,
    parent: PersonRef,
    child: PersonRef,
    auditedPerson: PersonRef,
    db: Db,
    audit: AuditWriter,
  ) {
    const parents = await this.repository.listParents(child.id, db);
    if (parents.length >= 2) {
      throw new AppError(
        409,
        "TOO_MANY_PARENTS",
        `${child.name} já tem dois pais registrados (${parents.map((item) => item.person.name).join(" e ")}). Remova um antes.`,
      );
    }
    if (await this.repository.isDescendant(child.id, parent.id, db)) {
      throw new AppError(
        400,
        "RELATION_CYCLE",
        `${parent.name} é descendente de ${child.name} e não pode ser pai ou mãe dele(a).`,
      );
    }

    const relation = await this.repository.create(
      { organizationId: context.churchId, personId: parent.id, relativeId: child.id, type: "PAI_MAE" },
      db,
    );
    await audit(relationAudit("adicionar_parente", auditedPerson, relation, { after: snapshot(relation) }));
  }

  // Um cônjuge por pessoa; o falecido não conta (RF-F11).
  private async linkSpouses(
    context: RequestContext,
    person: RelativePerson,
    relative: RelativePerson,
    db: Db,
    audit: AuditWriter,
  ) {
    for (const someone of [person, relative]) {
      const spouses = await this.repository.listSpouses(someone.id, db);
      const current = spouses
        .map((relation) => (relation.personId === someone.id ? relation.relative : relation.person))
        .find((spouse) => spouse.status !== "FALECIDO");
      if (current) {
        throw new AppError(
          409,
          "SPOUSE_EXISTS",
          `${someone.name} já tem cônjuge registrado (${current.name}). Remova antes.`,
        );
      }
    }

    // O par fica em ordem de id: um laço só, lido nos dois sentidos.
    const [first, second] = [person.id, relative.id].sort();
    const relation = await this.repository.create(
      { organizationId: context.churchId, personId: first, relativeId: second, type: "CONJUGE" },
      db,
    );
    await audit(relationAudit("adicionar_parente", person, relation, { after: snapshot(relation) }));
  }

  private async relativesOf(context: RequestContext, id: string, db?: Db) {
    const direct = await this.repository.listDirect([id], db);
    const found: Found[] = [];
    const parents: RelativePerson[] = [];
    const children: RelativePerson[] = [];

    for (const relation of direct) {
      if (relation.type === "CONJUGE") {
        const spouse = relation.personId === id ? relation.relative : relation.person;
        found.push({ kind: "CONJUGE", person: spouse, relationId: relation.id, via: null });
      } else if (relation.relativeId === id) {
        parents.push(relation.person);
        found.push({ kind: "PAI_MAE", person: relation.person, relationId: relation.id, via: null });
      } else {
        children.push(relation.relative);
        found.push({ kind: "FILHO", person: relation.relative, relationId: relation.id, via: null });
      }
    }

    if (parents.length > 0 || children.length > 0) {
      const parentIds = parents.map((item) => item.id);
      const childIds = children.map((item) => item.id);
      const second = await this.repository.listSecondLevel(parentIds, childIds, db);
      const siblings = new Set<string>();

      for (const relation of second) {
        if (parentIds.includes(relation.relativeId)) {
          found.push({ kind: "AVO", person: relation.person, relationId: null, via: relation.relative });
        } else if (parentIds.includes(relation.personId)) {
          // Irmão: outro filho de um dos pais (meio-irmão também). Uma vez só, mesmo com os dois pais.
          if (relation.relativeId === id || siblings.has(relation.relativeId)) continue;
          siblings.add(relation.relativeId);
          found.push({ kind: "IRMAO", person: relation.relative, relationId: null, via: null });
        }
        if (childIds.includes(relation.personId)) {
          found.push({ kind: "NETO", person: relation.relative, relationId: null, via: relation.person });
        }
      }
    }

    return found
      .sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.person.name.localeCompare(b.person.name, "pt-BR"))
      .map((item) => mapRelative(item, context.readOrganizationIds));
  }
}

import type { Prisma } from "@prisma/client";
import { AppError } from "./errors.js";

// Sede criada pela migração 20261009_acesso_base, dona dos dados existentes.
// As rotas usam a organização da requisição (src/lib/access.ts); a constante
// fica só como padrão dos scripts enquanto houver apenas a igreja piloto.
export const DEFAULT_ORGANIZATION_ID = "csedepiloto00000000000000";

interface OrganizationReferences {
  categoryId?: string | null;
  supplierId?: string | null;
  personId?: string | null;
  bankAccountId?: string | null;
}

// Um lançamento só aponta para cadastros da mesma organização.
export async function assertReferencesInOrganization(
  db: Prisma.TransactionClient,
  organizationId: string,
  references: OrganizationReferences,
) {
  const checks: Array<[string | null | undefined, () => Promise<number>, string]> = [
    [references.categoryId, () => db.category.count({ where: { id: references.categoryId!, organizationId } }), "Categoria"],
    [references.supplierId, () => db.supplier.count({ where: { id: references.supplierId!, organizationId } }), "Fornecedor"],
    [references.personId, () => db.person.count({ where: { id: references.personId!, organizationId } }), "Pessoa"],
    [
      references.bankAccountId,
      () => db.bankAccount.count({ where: { id: references.bankAccountId!, organizationId } }),
      "Conta bancária",
    ],
  ];

  for (const [id, count, label] of checks) {
    if (id && (await count()) === 0) {
      throw new AppError(400, "INVALID_REFERENCE", `${label} não pertence a esta organização.`);
    }
  }
}

import type { Prisma } from "@prisma/client";
import {
  PERMISSION_MODULE_NAMES,
  permissionCatalog,
  type PermissionKey,
  type PermissionModule,
} from "../modules/acesso/permissoes/catalog/index.js";
import type { AccessibleOrganization } from "./access.js";
import { prisma } from "./prisma.js";

// Acesso do suporte do iEzer (PRD Acesso › Acesso do suporte do iEzer, RT-AB11).

export const SUPPORT_DEFAULT_HOURS = 72;
export const SUPPORT_MAX_HOURS = 7 * 24;
export const SUPPORT_EMERGENCY_MAX_HOURS = 24;

// Escopo do pedido: módulos do catálogo de permissões.
export const SUPPORT_SCOPES = Object.keys(PERMISSION_MODULE_NAMES) as [PermissionModule, ...PermissionModule[]];

// Nunca liberadas ao suporte, mesmo autorizado: notas pastorais (RF-SP05) e a própria autorização.
export const SUPPORT_FORBIDDEN_KEYS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  "pessoas.notas_pastorais.ver",
  "pessoas.notas_pastorais.editar",
  "acesso.suporte.autorizar",
]);

// Mesmo com escrita liberada, o suporte não mexe em acessos nem na organização.
export const SUPPORT_WRITE_BLOCKED_PREFIXES = ["/api/acesso", "/api/organizacao"];

export const SUPPORT_READ_ONLY_CODE = "SUPPORT_READ_ONLY";
export const SUPPORT_FORBIDDEN_CODE = "SUPPORT_FORBIDDEN";

export interface SupportGrantAccess {
  grantId: string;
  canWrite: boolean;
  expiresAt: Date;
}

export function supportPermissions(scope: readonly string[]) {
  return new Set<PermissionKey>(
    permissionCatalog
      .filter((permission) => scope.includes(permission.module) && !SUPPORT_FORBIDDEN_KEYS.has(permission.key))
      .map((permission) => permission.key),
  );
}

// Ativo = autorizado e dentro do prazo; o vencimento não precisa de job (RF-SP08).
export const activeGrantWhere = (now = new Date()) =>
  ({ status: "ATIVO", expiresAt: { gt: now } }) satisfies Prisma.SupportGrantWhereInput;

// Organizações que o atendente alcança agora: sede e congregações de cada igreja com grant ativo,
// com as permissões do escopo. Conferido a cada requisição (RT-AB11).
export async function loadSupportOrganizations(): Promise<AccessibleOrganization[]> {
  const grants = await prisma.supportGrant.findMany({
    where: { ...activeGrantWhere(), church: { isActive: true } },
    orderBy: { expiresAt: "desc" },
    select: {
      id: true,
      scope: true,
      canWrite: true,
      expiresAt: true,
      church: {
        select: {
          id: true,
          name: true,
          type: true,
          parentId: true,
          children: { where: { isActive: true }, select: { id: true, name: true, type: true, parentId: true } },
        },
      },
    },
  });

  const organizations = new Map<string, AccessibleOrganization>();

  // Dois grants ativos na mesma igreja: vale o que vence por último (o primeiro da lista).
  for (const grant of grants) {
    if (organizations.has(grant.church.id)) continue;

    const support: SupportGrantAccess = { grantId: grant.id, canWrite: grant.canWrite, expiresAt: grant.expiresAt! };
    const { children, ...church } = grant.church;

    for (const organization of [church, ...children]) {
      organizations.set(organization.id, { ...organization, permissions: supportPermissions(grant.scope), support });
    }
  }

  return [...organizations.values()];
}

// Usuários da igreja com uma das permissões na sede (avisos por e-mail).
export async function churchUsersWith(churchId: string, keys: PermissionKey[], db: Prisma.TransactionClient = prisma) {
  return db.user.findMany({
    where: {
      status: "ATIVO",
      assignments: {
        some: {
          organizationId: churchId,
          profile: { permissions: { some: { permissionKey: { in: keys } } } },
        },
      },
    },
    select: { id: true, name: true, email: true },
  });
}

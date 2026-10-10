import type { OrganizationType } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  getPermission,
  isPermissionKey,
  type PermissionKey,
} from "../modules/acesso/permissoes/catalog/index.js";
import type { AuditActor } from "./audit.js";
import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";

export interface AccessibleOrganization {
  id: string;
  name: string;
  type: OrganizationType;
  parentId: string | null;
  permissions: Set<PermissionKey>;
}

export interface RequestAccess {
  organizations: AccessibleOrganization[];
  // Organização ativa do seletor (X-Organization-Id).
  organizationId: string;
  // "Todas as congregações" (X-Organization-Scope: todas), só a partir da sede.
  allCongregations: boolean;
  readOrganizationIds: string[];
  // null em "todas": criar exige escolher uma organização.
  writeOrganizationId: string | null;
  permissions: Set<PermissionKey>;
}

declare module "fastify" {
  interface FastifyRequest {
    access: RequestAccess;
  }
}

// Permissões efetivas por organização: as atribuições dali somadas às da sede,
// que alcançam as congregações (PRD Acesso › Conceitos do domínio, RT-AB03).
export async function loadAccessibleOrganizations(userId: string): Promise<AccessibleOrganization[]> {
  const assignments = await prisma.userAssignment.findMany({
    where: { userId, organization: { isActive: true } },
    select: {
      organization: { select: { id: true, name: true, type: true, parentId: true } },
      profile: { select: { permissions: { select: { permissionKey: true } } } },
    },
  });

  const direct = new Map<string, AccessibleOrganization>();

  for (const { organization, profile } of assignments) {
    const entry = direct.get(organization.id) ?? { ...organization, permissions: new Set<PermissionKey>() };

    for (const { permissionKey } of profile.permissions) {
      if (isPermissionKey(permissionKey)) entry.permissions.add(permissionKey);
    }

    direct.set(organization.id, entry);
  }

  const sedeIds = [...direct.values()].filter((org) => org.type === "SEDE").map((org) => org.id);
  const children = sedeIds.length
    ? await prisma.organization.findMany({
        where: { parentId: { in: sedeIds }, isActive: true },
        select: { id: true, name: true, type: true, parentId: true },
      })
    : [];

  const reachable = new Map(direct);

  for (const child of children) {
    const own = direct.get(child.id)?.permissions ?? [];
    const inherited = direct.get(child.parentId!)?.permissions ?? [];
    reachable.set(child.id, { ...child, permissions: new Set([...own, ...inherited]) });
  }

  const collator = new Intl.Collator("pt-BR");

  return [...reachable.values()].sort(
    (a, b) =>
      Number(a.type === "CONGREGACAO") - Number(b.type === "CONGREGACAO") || collator.compare(a.name, b.name),
  );
}

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

// Hook das rotas de dados: resolve a organização ativa contra o que o usuário alcança,
// nunca contra o que o front diz (RT-AB04).
export async function resolveOrganization(request: FastifyRequest, reply: FastifyReply) {
  const organizations = await loadAccessibleOrganizations(request.user.id);

  if (organizations.length === 0) {
    return reply.code(403).send({
      statusCode: 403,
      code: "NO_ORGANIZATION",
      message: "Você ainda não tem acesso a nenhuma organização. Fale com o administrador da sua igreja.",
    });
  }

  const requestedId = headerValue(request, "x-organization-id");
  const allCongregations = headerValue(request, "x-organization-scope") === "todas";
  const active = requestedId ? organizations.find((org) => org.id === requestedId) : organizations[0];

  if (!active || (allCongregations && active.type !== "SEDE")) {
    return reply.code(403).send({
      statusCode: 403,
      code: "ORGANIZATION_FORBIDDEN",
      message: "Você não tem acesso a esta organização.",
    });
  }

  request.access = {
    organizations,
    organizationId: active.id,
    allCongregations,
    readOrganizationIds: allCongregations
      ? [active.id, ...organizations.filter((org) => org.parentId === active.id).map((org) => org.id)]
      : [active.id],
    writeOrganizationId: allCongregations ? null : active.id,
    permissions: active.permissions,
  };
}

// Igreja-cliente (sede) da organização ativa: dona dos perfis de acesso.
export function getChurchId(request: FastifyRequest) {
  const active = request.access.organizations.find((org) => org.id === request.access.organizationId)!;
  return active.parentId ?? active.id;
}

export function hasPermission(request: FastifyRequest, key: PermissionKey) {
  return request.access.permissions.has(key);
}

// preHandler por rota: basta uma das chaves. 403 traz o nome amigável (RT-AF04).
export function requirePermission(...keys: [PermissionKey, ...PermissionKey[]]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (keys.some((key) => request.access.permissions.has(key))) return;

    const permission = getPermission(keys[0]);

    return reply.code(403).send({
      statusCode: 403,
      code: "PERMISSION_DENIED",
      message: `Você não tem a permissão "${permission.name}".`,
      permission: permission.key,
      permissionName: permission.name,
    });
  };
}

export interface RequestContext {
  // Sede da organização ativa: dona dos perfis e das listas da igreja.
  churchId: string;
  readOrganizationIds: string[];
  writeOrganizationId: string | null;
  permissions: ReadonlySet<PermissionKey>;
  actor: AuditActor;
}

export function getRequestContext(request: FastifyRequest): RequestContext {
  return {
    churchId: getChurchId(request),
    readOrganizationIds: request.access.readOrganizationIds,
    writeOrganizationId: request.access.writeOrganizationId,
    permissions: request.access.permissions,
    actor: {
      type: "USUARIO",
      userId: request.user.id,
      ip: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    },
  };
}

// Criar exige uma organização concreta; em "Todas as congregações" não há onde gravar.
export function requireWriteOrganization(context: RequestContext) {
  if (!context.writeOrganizationId) {
    throw new AppError(
      400,
      "ORGANIZATION_REQUIRED",
      "Escolha a sede ou uma congregação no seletor para fazer lançamentos.",
    );
  }

  return context.writeOrganizationId;
}

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
import {
  loadSupportOrganizations,
  SUPPORT_FORBIDDEN_CODE,
  SUPPORT_READ_ONLY_CODE,
  SUPPORT_WRITE_BLOCKED_PREFIXES,
  type SupportGrantAccess,
} from "./support.js";
import { hasTeamRole } from "./team.js";
import { TERMS_VERSION } from "./terms.js";

export interface AccessibleOrganization {
  id: string;
  name: string;
  type: OrganizationType;
  parentId: string | null;
  permissions: Set<PermissionKey>;
  // Só para o atendente do suporte: o grant que libera esta organização.
  support?: SupportGrantAccess;
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
  // Atendente do suporte na igreja (RT-AB11); null para usuário da igreja.
  support: SupportGrantAccess | null;
}

declare module "fastify" {
  interface FastifyRequest {
    access: RequestAccess;
  }
  interface FastifyContextConfig {
    // Rota que o suporte nunca usa, mesmo autorizado (ex.: notas pastorais, RF-SP05).
    denySupport?: boolean;
  }
}

// Permissões efetivas por organização: as atribuições dali somadas às da sede,
// que alcançam as congregações (PRD Acesso › Conceitos do domínio, RT-AB03). O atendente do
// suporte não tem atribuições: alcança as igrejas com acesso do suporte ativo.
export async function loadAccessibleOrganizations(
  userId: string,
  isSupportAgent = false,
): Promise<AccessibleOrganization[]> {
  if (isSupportAgent) return sortOrganizations(await loadSupportOrganizations());

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

  return sortOrganizations([...reachable.values()]);
}

function sortOrganizations(organizations: AccessibleOrganization[]) {
  const collator = new Intl.Collator("pt-BR");

  return organizations.sort(
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
  // Termos aceitos antes de qualquer dado (RF-CV06); o aceite é POST /me/termos.
  if (request.user.termsVersion !== TERMS_VERSION) {
    return reply.code(403).send({
      statusCode: 403,
      code: "TERMS_REQUIRED",
      message: "Aceite os termos de uso e de confidencialidade para continuar.",
    });
  }

  // Equipe com o papel Suporte alcança as igrejas com acesso do suporte ativo (até a Sprint 19).
  const isSupportAgent = hasTeamRole(request.team?.roles, "SUPORTE");
  const organizations = await loadAccessibleOrganizations(request.user.id, isSupportAgent);

  if (organizations.length === 0) {
    if (isSupportAgent) {
      return reply.code(403).send({
        statusCode: 403,
        code: "SUPPORT_NO_GRANT",
        message: "Não há acesso do suporte ativo para nenhuma igreja. Peça a autorização no back-office.",
      });
    }

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

  const support = active.support ?? null;
  if (support) {
    const denied = supportDenial(request, support);
    if (denied) return reply.code(403).send({ statusCode: 403, ...denied });
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
    support,
  };
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Limites do suporte autorizado: rotas fechadas a ele, somente leitura por padrão e, mesmo com
// escrita liberada, nada em acessos e organização (RF-SP02, RF-SP05).
function supportDenial(request: FastifyRequest, support: SupportGrantAccess) {
  if (request.routeOptions.config.denySupport) {
    return { code: SUPPORT_FORBIDDEN_CODE, message: "O suporte do iEzer não tem acesso a este conteúdo." };
  }

  if (READ_METHODS.has(request.method)) return null;

  if (!support.canWrite) {
    return { code: SUPPORT_READ_ONLY_CODE, message: "O acesso do suporte é somente leitura." };
  }

  const url = request.routeOptions.url ?? request.url;
  if (SUPPORT_WRITE_BLOCKED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return { code: SUPPORT_FORBIDDEN_CODE, message: "O suporte do iEzer não altera acessos nem a organização." };
  }

  return null;
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

// preHandler para ações da igreja inteira (ex.: Configurações › Organização): a permissão
// precisa estar na sede, não basta tê-la numa congregação.
export function requireChurchPermission(key: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const church = request.access.organizations.find((org) => org.id === getChurchId(request));
    if (church?.permissions.has(key)) return;

    const permission = getPermission(key);

    return reply.code(403).send({
      statusCode: 403,
      code: "PERMISSION_DENIED",
      message: `Você não tem a permissão "${permission.name}" na sede.`,
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
      // Ação do atendente sai no log como "Suporte iEzer (nome)" (RF-SP07).
      type: request.access.support ? "SUPORTE" : "USUARIO",
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

// Organizações alcançadas onde o usuário tem uma das permissões (telas que cruzam organizações,
// como Usuários e convites).
export function organizationIdsWith(request: FastifyRequest, ...keys: [PermissionKey, ...PermissionKey[]]) {
  return request.access.organizations
    .filter((org) => keys.some((key) => org.permissions.has(key)))
    .map((org) => org.id);
}

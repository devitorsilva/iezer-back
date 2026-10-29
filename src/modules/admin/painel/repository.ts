import { Prisma, type OrganizationStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";
import { SUPPORT_REQUEST_TTL_DAYS } from "../../../lib/support.js";
import { ADMIN_PERMISSION } from "../../acesso/travas.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number, now: Date) => new Date(now.getTime() - days * DAY_MS);

export interface HealthChurchRow {
  id: string;
  name: string;
  status: OrganizationStatus;
}

// Sedes acompanhadas pelo painel: todas menos as encerradas.
const churches = Prisma.sql`
  SELECT c."id", c."name", c."status"
  FROM "Organization" c
  WHERE c."type" = 'SEDE' AND c."parentId" IS NULL AND c."status" <> 'ENCERRADA'`;

// Usuários da igreja c (atribuição na sede ou numa congregação).
const churchUsers = Prisma.sql`
  FROM "UserAssignment" a
  JOIN "Organization" o ON o."id" = a."organizationId"
  JOIN "User" u ON u."id" = a."userId"
  WHERE COALESCE(o."parentId", o."id") = c."id"`;

// Consultas do painel de saúde (RT-BB09): uma por alerta, agregadas por igreja. Devolvem só id,
// nome e situação da igreja, nunca dados de pessoa (B10).
export class HealthRepository {
  // Admins ativos por igreja, pela regra das travas: usuário ATIVO com "Gerenciar perfis de acesso"
  // numa organização ativa.
  adminCounts() {
    return prisma.$queryRaw<(HealthChurchRow & { admins: number })[]>`
      SELECT c.*, (
        SELECT COUNT(DISTINCT u."id")::int
        FROM "UserAssignment" a
        JOIN "AccessProfile" p ON p."id" = a."profileId" AND p."organizationId" = c."id"
        JOIN "AccessProfilePermission" pp ON pp."profileId" = p."id" AND pp."permissionKey" = ${ADMIN_PERMISSION}
        JOIN "Organization" o ON o."id" = a."organizationId" AND o."isActive"
        JOIN "User" u ON u."id" = a."userId" AND u."status" = 'ATIVO'
      ) AS "admins"
      FROM (${churches}) c
      ORDER BY c."name"`;
  }

  stuckInImplantacao(days: number, now: Date) {
    return prisma.$queryRaw<HealthChurchRow[]>`
      SELECT c."id", c."name", c."status" FROM "Organization" c
      WHERE c."type" = 'SEDE' AND c."parentId" IS NULL
        AND c."status" = 'IMPLANTACAO' AND c."statusChangedAt" < ${daysAgo(days, now)}
      ORDER BY c."name"`;
  }

  // E-mail rejeitado ou marcado como spam (webhook do Resend, RT-BB08).
  withRejectedEmails(days: number, now: Date) {
    return prisma.$queryRaw<HealthChurchRow[]>`
      SELECT c.* FROM (${churches}) c
      WHERE EXISTS (
        SELECT 1 FROM "EmailEvent" e
        WHERE e."organizationId" = c."id" AND e."occurredAt" >= ${daysAgo(days, now)}
      )
      ORDER BY c."name"`;
  }

  // Bloqueio vigente do login (login-lock.ts guarda o e-mail em minúsculas).
  withLockedLogin(now: Date) {
    return prisma.$queryRaw<HealthChurchRow[]>`
      SELECT c.* FROM (${churches}) c
      WHERE EXISTS (
        SELECT 1 ${churchUsers}
          AND EXISTS (
            SELECT 1 FROM "LoginLock" l WHERE l."email" = LOWER(u."email") AND l."lockedUntil" > ${now}
          )
      )
      ORDER BY c."name"`;
  }

  // Igreja ativa sem acesso: nem login, nem sessão renovada (o Better Auth renova uma vez por dia).
  withoutAccess(days: number, now: Date) {
    return prisma.$queryRaw<HealthChurchRow[]>`
      SELECT c.* FROM (${churches}) c
      WHERE c."status" = 'ATIVA'
        AND COALESCE(
          GREATEST(
            (SELECT MAX(u."lastLoginAt") ${churchUsers}),
            (SELECT MAX(s."updatedAt") FROM "Session" s
             JOIN "UserAssignment" a ON a."userId" = s."userId"
             JOIN "Organization" o ON o."id" = a."organizationId"
             WHERE COALESCE(o."parentId", o."id") = c."id")
          ),
          '-infinity'::timestamp
        ) < ${daysAgo(days, now)}
      ORDER BY c."name"`;
  }

  // Pedido de acesso esperando o iEzer ou a igreja, ainda dentro dos 7 dias (RF-BO36).
  withPendingRequests(now: Date) {
    return prisma.$queryRaw<HealthChurchRow[]>`
      SELECT c.* FROM (${churches}) c
      WHERE EXISTS (
        SELECT 1 FROM "SupportGrant" g
        WHERE g."churchId" = c."id"
          AND (
            g."status" = 'AGUARDANDO_IEZER'
            OR (g."status" = 'PENDENTE'
                AND COALESCE(g."internalApprovedAt", g."requestedAt") > ${daysAgo(SUPPORT_REQUEST_TTL_DAYS, now)})
          )
      )
      ORDER BY c."name"`;
  }
}

import type { AccessProfileFactoryKey, Prisma } from "@prisma/client";
import { FastifyPluginAsync } from "fastify";
import { getChurchId, requirePermission } from "../../../lib/access.js";
import { prisma } from "../../../lib/prisma.js";

const ADMIN_PERMISSION = "acesso.perfis.gerenciar";

// Checklist de primeiro acesso (RF-OB03) e aviso de admin único (RF-OB04), calculados dos dados.
export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/onboarding",
    { preHandler: requirePermission("acesso.usuarios.ver", "acesso.usuarios.gerenciar") },
    async (request) => {
      const churchId = getChurchId(request);
      const now = new Date();

      const profileWithAdmin: Prisma.AccessProfileWhereInput = {
        organizationId: churchId,
        permissions: { some: { permissionKey: ADMIN_PERMISSION } },
      };
      const factoryProfile = (factoryKey: AccessProfileFactoryKey): Prisma.AccessProfileWhereInput => ({
        organizationId: churchId,
        factoryKey,
      });

      const countUsers = (profile: Prisma.AccessProfileWhereInput) =>
        prisma.user.count({ where: { status: "ATIVO", assignments: { some: { profile } } } });
      const countInvites = (profile: Prisma.AccessProfileWhereInput) =>
        prisma.invite.count({
          where: { churchId, status: "PENDENTE", expiresAt: { gt: now }, assignments: { some: { profile } } },
        });

      const [church, activeAdmins, invitedAdmins, secretaries, invitedSecretaries, treasurers, invitedTreasurers, imports] =
        await Promise.all([
          prisma.organization.findUnique({ where: { id: churchId }, select: { congregationsReviewedAt: true } }),
          countUsers(profileWithAdmin),
          countInvites(profileWithAdmin),
          countUsers(factoryProfile("SECRETARIO")),
          countInvites(factoryProfile("SECRETARIO")),
          countUsers(factoryProfile("TESOUREIRO")),
          countInvites(factoryProfile("TESOUREIRO")),
          // Importação confirmada pela planilha, na sede ou numa congregação (o log é a única marca).
          prisma.auditLog.count({
            where: {
              module: "PESSOAS",
              action: "importar",
              organization: { OR: [{ id: churchId }, { parentId: churchId }] },
            },
          }),
        ]);

      return {
        checklist: {
          congregationsReviewed: Boolean(church?.congregationsReviewedAt),
          secondAdminInvited: activeAdmins + invitedAdmins >= 2,
          secretaryInvited: secretaries + invitedSecretaries > 0,
          treasurerInvited: treasurers + invitedTreasurers > 0,
          peopleImported: imports > 0,
        },
        singleAdmin: activeAdmins <= 1,
      };
    },
  );
};

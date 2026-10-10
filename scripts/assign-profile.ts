// Dá um perfil de fábrica a um usuário numa organização (atribuição).
// Uso: npm run user:assign -- <email> <PASTOR|TESOUREIRO|SECRETARIO> [slug-da-organização]
// Sem slug, usa a sede piloto. Até a Sprint 8 (tela de usuários) é o único jeito de atribuir.
import { AccessProfileFactoryKey } from "@prisma/client";
import { runAudited, SYSTEM_ACTOR } from "../src/lib/audit.js";
import { DEFAULT_ORGANIZATION_ID } from "../src/lib/organization.js";
import { prisma } from "../src/lib/prisma.js";
import { seedFactoryProfiles } from "../src/modules/acesso/perfis/factory.js";

async function main() {
  const [email, factoryArg, slug] = process.argv.slice(2);

  if (!email || !factoryArg) {
    throw new Error("Uso: npm run user:assign -- <email> <PASTOR|TESOUREIRO|SECRETARIO> [slug-da-organização]");
  }

  if (!(factoryArg in AccessProfileFactoryKey)) {
    throw new Error(`Perfil inválido: ${factoryArg}`);
  }

  const factoryKey = factoryArg as AccessProfileFactoryKey;
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error(`Usuário não encontrado: ${email}`);

  const organization = await prisma.organization.findUnique({
    where: slug ? { slug } : { id: DEFAULT_ORGANIZATION_ID },
  });
  if (!organization) throw new Error(`Organização não encontrada: ${slug ?? DEFAULT_ORGANIZATION_ID}`);

  const churchId = organization.parentId ?? organization.id;

  const assignment = await runAudited(SYSTEM_ACTOR, async (tx, audit) => {
    await seedFactoryProfiles(tx, churchId);

    const profile = await tx.accessProfile.findUniqueOrThrow({
      where: { organizationId_factoryKey: { organizationId: churchId, factoryKey } },
    });

    const existing = await tx.userAssignment.findUnique({
      where: {
        userId_profileId_organizationId: { userId: user.id, profileId: profile.id, organizationId: organization.id },
      },
    });
    if (existing) return existing;

    const created = await tx.userAssignment.create({
      data: { userId: user.id, profileId: profile.id, organizationId: organization.id },
    });

    await audit({
      organizationId: organization.id,
      module: "ACESSO",
      action: "atribuir_perfil",
      targetType: "UserAssignment",
      targetId: created.id,
      after: { userId: user.id, email: user.email, profile: profile.name, organization: organization.name },
    });

    return created;
  });

  console.log(`${user.email}: ${factoryKey} em ${organization.name} (atribuição ${assignment.id}).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

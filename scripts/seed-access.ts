// Cria os perfis de fábrica (Pastor, Tesoureiro, Secretário) nas sedes que ainda não os têm.
// Uso: npm run acesso:seed. Pode rodar mais de uma vez; perfis existentes não mudam
// (para voltar ao padrão, use POST /api/acesso/perfis/:id/restaurar).
import { runAudited, SYSTEM_ACTOR } from "../src/lib/audit.js";
import { prisma } from "../src/lib/prisma.js";
import { seedFactoryProfiles } from "../src/modules/acesso/perfis/factory.js";

async function main() {
  const churches = await prisma.organization.findMany({
    where: { type: "SEDE", parentId: null },
    select: { id: true, name: true },
  });

  for (const church of churches) {
    const created = await runAudited(SYSTEM_ACTOR, async (tx, audit) => {
      const keys = await seedFactoryProfiles(tx, church.id);
      await audit(
        keys.map((factoryKey) => ({
          organizationId: church.id,
          module: "ACESSO" as const,
          action: "criar_perfil_fabrica",
          targetType: "AccessProfile",
          after: { factoryKey },
        })),
      );
      return keys;
    });

    console.log(`${church.name}: ${created.length ? `criados ${created.join(", ")}` : "perfis de fábrica já existiam"}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

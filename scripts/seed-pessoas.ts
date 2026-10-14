// Cria as listas da igreja de fábrica (formas de admissão, motivos, cargos, como conheceu)
// nas sedes que ainda não têm. Uso: npm run pessoas:seed. Pode rodar mais de uma vez.
import { runAudited, SYSTEM_ACTOR } from "../src/lib/audit.js";
import { prisma } from "../src/lib/prisma.js";
import { seedChurchLists } from "../src/modules/pessoas/listas/factory.js";

async function main() {
  const churches = await prisma.organization.findMany({
    where: { type: "SEDE", parentId: null },
    select: { id: true, name: true },
  });

  for (const church of churches) {
    const created = await runAudited(SYSTEM_ACTOR, async (tx, audit) => {
      const count = await seedChurchLists(tx, church.id);
      if (count > 0) {
        await audit({
          organizationId: church.id,
          module: "PESSOAS",
          action: "criar_listas_fabrica",
          targetType: "ChurchListItem",
          after: { count },
        });
      }
      return count;
    });

    console.log(`${church.name}: ${created ? `${created} itens de lista criados` : "listas de fábrica já existiam"}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

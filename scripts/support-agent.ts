// Marca (ou desmarca) um usuário como atendente do suporte do iEzer (RF-SP06), no lugar de uma
// tela interna enquanto a equipe é pequena. Crie a conta antes com `npm run user:create`.
// Uso: npm run suporte:agente -- <email> [remover]
//
// O atendente é uma conta nominal, sem atribuições em igreja nenhuma, e sempre usa 2FA: no
// primeiro login, a configuração é obrigatória.
import { runAudited, SYSTEM_ACTOR } from "../src/lib/audit.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const [emailArg, mode] = process.argv.slice(2);

  if (!emailArg || (mode && mode !== "remover")) {
    throw new Error("Uso: npm run suporte:agente -- <email> [remover]");
  }

  const email = emailArg.trim().toLowerCase();
  const isSupportAgent = mode !== "remover";
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, isSupportAgent: true, personId: true, _count: { select: { assignments: true } } },
  });

  if (!user) throw new Error(`Usuário ${email} não encontrado. Crie com npm run user:create.`);

  if (isSupportAgent && (user._count.assignments > 0 || user.personId)) {
    throw new Error("Este usuário pertence a uma igreja. O atendente precisa de uma conta própria, sem atribuições.");
  }

  if (user.isSupportAgent === isSupportAgent) {
    console.log(`${email} já ${isSupportAgent ? "é" : "não é"} atendente do suporte.`);
    return;
  }

  await runAudited(SYSTEM_ACTOR, async (tx, audit) => {
    await tx.user.update({ where: { id: user.id }, data: { isSupportAgent } });
    // Muda o que a conta alcança: entra de novo.
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit({
      organizationId: null,
      module: "ACESSO",
      action: isSupportAgent ? "marcar_atendente_suporte" : "desmarcar_atendente_suporte",
      targetType: "User",
      targetId: user.id,
      before: { isSupportAgent: user.isSupportAgent },
      after: { isSupportAgent },
    });
  });

  console.log(`${user.name} (${email}) ${isSupportAgent ? "agora é" : "deixou de ser"} atendente do suporte.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

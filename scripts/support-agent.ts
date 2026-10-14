// Bootstrap do primeiro Administrador iEzer (PRD Back-office › Migração). Depois dele, a equipe
// entra só por convite na tela Equipe (RF-BO07).
// Uso: npm run suporte:agente -- <email> "<nome>"
//
// Só roda enquanto não há Administrador iEzer ativo. E-mail de um membro da equipe (ex.: atendente
// migrado da Sprint 13) ganha o papel Administrador; e-mail novo recebe um convite (link no log e por
// e-mail) para definir a senha, configurar o app autenticador e aceitar o termo.
import { runAudited, SYSTEM_ACTOR } from "../src/lib/audit.js";
import { prisma } from "../src/lib/prisma.js";
import { teamInviteUrl } from "../src/lib/team-emails.js";
import { teamRepository, teamService } from "../src/modules/admin/equipe/routes.js";

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim();

  if (!emailArg || !name) {
    throw new Error('Uso: npm run suporte:agente -- <email> "<nome>"');
  }

  if ((await teamRepository.countActiveAdmins()) > 0) {
    throw new Error("Já existe Administrador iEzer ativo. Convide os próximos pela tela Equipe do back-office.");
  }

  const email = emailArg.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, status: true, teamMember: { select: { id: true, roles: true } } },
  });

  if (user && !user.teamMember) {
    throw new Error("Este e-mail é de um usuário de igreja. A conta da equipe precisa de um e-mail próprio.");
  }

  if (user?.teamMember) {
    if (user.status !== "ATIVO") throw new Error(`${email} está desativado. Use outro e-mail.`);

    const member = user.teamMember;
    const roles = [...new Set([...member.roles, "ADMINISTRADOR" as const])];
    await runAudited(SYSTEM_ACTOR, async (tx, audit) => {
      await tx.teamMember.update({ where: { id: member.id }, data: { roles } });
      await audit({
        organizationId: null,
        module: "BACKOFFICE",
        action: "promover_administrador_equipe",
        targetType: "TeamMember",
        targetId: member.id,
        before: { roles: member.roles },
        after: { roles },
      });
    });

    console.log(`${user.name} (${email}) agora é Administrador iEzer.`);
    return;
  }

  const { link, emailSent } = await teamService.invite(
    { actor: SYSTEM_ACTOR, userId: null, userName: null },
    { email, name, roles: ["ADMINISTRADOR"] },
  );

  console.log(`Convite de Administrador iEzer para ${name} (${email}), válido por 72h.`);
  console.log(`E-mail ${emailSent ? "enviado" : "não enviado (sem RESEND_API_KEY)"}. Link:\n${link}`);
  console.log(`(App admin em ${teamInviteUrl("").replace(/\/convite\/$/, "")})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

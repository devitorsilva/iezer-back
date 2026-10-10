// Cria (ou atualiza) um usuário de teste com login por e-mail e senha.
// Uso: npm run user:create -- <email> <nome> <senha> [ATIVO|DESATIVADO|SUSPENSO]
// Até a Sprint 6 (convites) é o único jeito de criar conta: o cadastro público está desligado.
import { UserStatus } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { isPasswordCompromised } from "better-auth/plugins";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const [email, name, password, statusArg = "ATIVO"] = process.argv.slice(2);

  if (!email || !name || !password) {
    throw new Error("Uso: npm run user:create -- <email> <nome> <senha> [ATIVO|DESATIVADO|SUSPENSO]");
  }

  if (!(statusArg in UserStatus)) {
    throw new Error(`Status inválido: ${statusArg}`);
  }

  if (password.length < 12) {
    throw new Error("A senha precisa ter pelo menos 12 caracteres.");
  }

  if (await isPasswordCompromised(password)) {
    throw new Error("Essa senha aparece em vazamentos conhecidos. Escolha outra.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const status = statusArg as UserStatus;
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    create: { email: normalizedEmail, name, status, emailVerified: true },
    update: { name, status },
  });

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: passwordHash } });
  } else {
    await prisma.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
    });
  }

  // Senha nova ou status alterado: derruba as sessões abertas.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`Usuário ${user.email} (${user.status}) pronto. id=${user.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

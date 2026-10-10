import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { haveIBeenPwned } from "better-auth/plugins";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

export const USER_INACTIVE_CODE = "USER_INACTIVE";
export const USER_INACTIVE_MESSAGE =
  "Seu acesso foi desativado. Fale com o administrador da sua igreja.";

// Mesmas origens liberadas no CORS (src/app.ts).
const localDevOrigins = Array.from({ length: 10 }, (_, index) => [
  `http://localhost:517${index}`,
  `http://127.0.0.1:517${index}`,
]).flat();

// Better Auth só para autenticação (PRD Acesso, A22 e RT-AB01). Organizações,
// perfis, permissões, convites e auditoria são tabelas do iEzer.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [env.WEB_ORIGIN, ...localDevOrigins],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    // Sem cadastro público: a Sprint 6 libera a criação só com convite válido.
    disableSignUp: true,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Sem cookie cache: suspender ou desativar o usuário vale na próxima requisição.
    cookieCache: { enabled: false },
  },
  user: {
    additionalFields: {
      status: { type: "string", input: false, returned: true },
      personId: { type: "string", required: false, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
    },
  },
  rateLimit: {
    // Limite por IP; o bloqueio por e-mail após 5 erros fica na Sprint 12.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    // IDs gerados pelo Prisma (cuid), como no resto do banco.
    database: { generateId: false },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { status: true },
          });

          if (user?.status !== "ATIVO") {
            throw APIError.from("FORBIDDEN", {
              code: USER_INACTIVE_CODE,
              message: USER_INACTIVE_MESSAGE,
            });
          }
        },
        after: async (session) => {
          await prisma.user.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
          });
        },
      },
    },
  },
  plugins: [haveIBeenPwned()],
});

export type AuthSession = typeof auth.$Infer.Session;

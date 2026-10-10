import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned } from "better-auth/plugins";
import { env } from "../config/env.js";
import { runAudited } from "./audit.js";
import { findUserChurch } from "./church.js";
import { passwordChangedEmail, passwordResetEmail, PASSWORD_RESET_TTL_SECONDS } from "./emails.js";
import { trySendMail } from "./mailer.js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordRuleViolation } from "./password-rules.js";
import { prisma } from "./prisma.js";
import { isRateLimited } from "./rate-limit.js";

export const USER_INACTIVE_CODE = "USER_INACTIVE";
export const USER_INACTIVE_MESSAGE =
  "Seu acesso foi desativado. Fale com o administrador da sua igreja.";
export const INVITE_REQUIRED_CODE = "INVITE_REQUIRED";
export const INVITE_REQUIRED_MESSAGE =
  "Não encontramos um acesso para este e-mail. Peça um convite ao administrador da sua igreja.";

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
  // Tokens de redefinição (e os próximos códigos de verificação) guardados como hash (RT-AB08).
  verification: { storeIdentifier: "hashed" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // Sem cadastro público: conta nova só pelo aceite do convite (POST /api/convites/:token/aceitar).
    disableSignUp: true,
    // Recuperação de senha (RF-RS01 a RF-RS03): link de 1h, uso único; quem só usa Google
    // ganha a conta de senha pelo mesmo fluxo; redefinir encerra as sessões.
    resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      // Limite por e-mail (RT-AB09); a resposta da tela é a mesma de sempre.
      if (isRateLimited(`reset-password:${user.email}`, 3, 60 * 60 * 1000)) return;

      const church = await findUserChurch(user.id);
      await trySendMail(passwordResetEmail({ to: user.email, name: user.name, churchName: church?.name ?? null, token }));
    },
    onPasswordReset: async ({ user }) => {
      const church = await findUserChurch(user.id);

      await runAudited({ type: "USUARIO", userId: user.id, ip: null, userAgent: null }, (_tx, audit) =>
        audit({
          organizationId: church?.id ?? null,
          module: "ACESSO",
          action: "redefinir_senha",
          targetType: "User",
          targetId: user.id,
        }),
      );
      await trySendMail(passwordChangedEmail({ to: user.email, name: user.name, churchName: church?.name ?? null }));
    },
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
      termsVersion: { type: "string", required: false, input: false },
    },
  },
  rateLimit: {
    // Limite por IP; o bloqueio por e-mail após 5 erros fica na Sprint 12.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
      "/reset-password": { window: 15 * 60, max: 10 },
    },
  },
  advanced: {
    // IDs gerados pelo Prisma (cuid), como no resto do banco.
    database: { generateId: false },
  },
  hooks: {
    // Regras de senha do iEzer também na redefinição (e-mail e nome da igreja).
    // Tamanho e senhas vazadas ficam com o Better Auth e o plugin haveIBeenPwned.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/reset-password") return;

      const { token, newPassword } = (ctx.body ?? {}) as { token?: string; newPassword?: string };
      if (!token || typeof newPassword !== "string") return;

      const verification = await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`);
      if (!verification) return;

      const user = await prisma.user.findUnique({ where: { id: verification.value }, select: { email: true } });
      if (!user) return;

      const church = await findUserChurch(verification.value);
      const violation = passwordRuleViolation(newPassword, { email: user.email, churchName: church?.name });

      if (violation) {
        throw APIError.from("BAD_REQUEST", { code: "WEAK_PASSWORD", message: violation });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Usuário só nasce com convite válido para o e-mail. O aceite por senha cria a conta
        // fora do Better Auth; esta trava vale para o login pelo Google (Sprint 12, RF-LG02).
        before: async (user) => {
          const invite = await prisma.invite.findFirst({
            where: { email: user.email.toLowerCase(), status: "PENDENTE", expiresAt: { gt: new Date() } },
            select: { id: true },
          });

          if (!invite) {
            throw APIError.from("FORBIDDEN", { code: INVITE_REQUIRED_CODE, message: INVITE_REQUIRED_MESSAGE });
          }
        },
      },
    },
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

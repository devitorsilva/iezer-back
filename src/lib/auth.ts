import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { env } from "../config/env.js";
import { recordAccountEvent } from "./account-events.js";
import { runAudited, type AuditActor } from "./audit.js";
import { findUserChurch } from "./church.js";
import { CLIENT_IP_HEADER } from "./client-ip.js";
import { approximateLocation, describeDevice } from "./devices.js";
import {
  loginLockedNotice,
  newDeviceLoginNotice,
  passwordChangedEmail,
  passwordResetEmail,
  PASSWORD_RESET_TTL_SECONDS,
  TWO_FACTOR_CODE_TTL_MINUTES,
  twoFactorChangedNotice,
  twoFactorCodeEmail,
} from "./emails.js";
import {
  clearLoginFailures,
  findLoginLock,
  LOGIN_LOCKED_CODE,
  loginLockedMessage,
  recordLoginFailure,
} from "./login-lock.js";
import { trySendMail } from "./mailer.js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordRuleViolation } from "./password-rules.js";
import { prisma } from "./prisma.js";
import { isRateLimited } from "./rate-limit.js";
import { requiresTwoFactor, TWO_FACTOR_REQUIRED_CODE, TWO_FACTOR_REQUIRED_MESSAGE } from "./two-factor.js";

export const USER_INACTIVE_CODE = "USER_INACTIVE";
export const USER_INACTIVE_MESSAGE =
  "Seu acesso foi desativado. Fale com o administrador da sua igreja.";
export const INVITE_REQUIRED_CODE = "INVITE_REQUIRED";
export const INVITE_REQUIRED_MESSAGE =
  "Não encontramos um acesso para este e-mail. Peça um convite ao administrador da sua igreja.";

// Endpoints de verificação do 2FA (plugin twoFactor).
const TWO_FACTOR_VERIFY_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-otp",
  "/two-factor/verify-backup-code",
]);

// Rotas do Better Auth fechadas ao navegador: senha, e-mail, sessões e contas passam pelas rotas
// do iEzer (/api/me), que aplicam as regras, o log e os alertas e chamam auth.api por dentro.
const BLOCKED_PATHS = new Set([
  "/change-password",
  "/set-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/update-session",
  "/list-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);

const isCallbackPath = (path: string | undefined) => Boolean(path?.startsWith("/callback/"));

// Cookie do desafio do 2FA (plugin twoFactor): a sessão criada na verificação é um login.
const TWO_FACTOR_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.two_factor=/;

const headerActor = (headers: Headers | null | undefined, userId: string | null): AuditActor => ({
  type: "USUARIO",
  userId,
  ip: headers?.get(CLIENT_IP_HEADER) ?? null,
  userAgent: headers?.get("user-agent") ?? null,
});

// Login, falha de login e logout no AuditLog (RF-LP01), na sede da igreja do usuário.
// Falha com e-mail sem usuário fica sem organização (não aparece para nenhuma igreja).
async function auditLogin(
  action: "login" | "login_falhou" | "logout" | "login_bloqueado",
  userId: string | null,
  headers: Headers | null | undefined,
  data: { actorUserId?: string | null; description?: string; after?: unknown } = {},
) {
  const actor = headerActor(headers, data.actorUserId === undefined ? userId : data.actorUserId);
  const church = userId ? await findUserChurch(userId) : null;

  await runAudited(actor, (_tx, audit) =>
    audit({
      organizationId: church?.id ?? null,
      module: "LOGIN",
      action,
      targetType: "User",
      targetId: userId,
      description: data.description,
      after: data.after,
    }),
  );
}

// Login concluído (com o 2FA, quando há): último acesso, alerta de dispositivo novo e log.
async function recordLogin(userId: string, headers: Headers | null | undefined) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
    select: { email: true, name: true },
  });
  await clearLoginFailures(user.email);

  // Dispositivo novo: navegador e sistema que não aparecem nos logins dos últimos 90 dias.
  // O primeiro login da conta não avisa.
  const userAgent = headers?.get("user-agent") ?? null;
  const device = describeDevice(userAgent);
  const previous = await prisma.auditLog.findMany({
    where: {
      module: "LOGIN",
      action: "login",
      targetId: userId,
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: { userAgent: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  await auditLogin("login", userId, headers);

  if (previous.length > 0 && !previous.some((entry) => describeDevice(entry.userAgent) === device)) {
    const church = await findUserChurch(userId);
    await trySendMail(
      newDeviceLoginNotice({
        to: user.email,
        name: user.name,
        churchName: church?.name ?? null,
        device,
        ip: headers?.get(CLIENT_IP_HEADER) ?? null,
        location: approximateLocation(headers),
      }),
    );
  }
}

const googleProvider: BetterAuthOptions["socialProviders"] =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          // Aparelho compartilhado na igreja: sempre deixar escolher a conta.
          prompt: "select_account",
        },
      }
    : undefined;

// Mesmas origens liberadas no CORS (src/app.ts).
const localDevOrigins = Array.from({ length: 10 }, (_, index) => [
  `http://localhost:517${index}`,
  `http://127.0.0.1:517${index}`,
]).flat();

// Better Auth só para autenticação (PRD Acesso, A22 e RT-AB01). Organizações,
// perfis, permissões, convites e auditoria são tabelas do iEzer.
export const auth = betterAuth({
  appName: "iEzer",
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
    // Sem cadastro público: conta nova só pelo aceite do convite (POST /api/convites/:token/aceitar)
    // ou pelo Google com convite válido (user.create.before).
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
      await clearLoginFailures(user.email);
      await recordAccountEvent({
        actor: { type: "USUARIO", userId: user.id, ip: null, userAgent: null },
        userId: user.id,
        action: "redefinir_senha",
        notice: (target) => passwordChangedEmail(target),
      });
    },
  },
  // Login com Google (RF-LG02): só para e-mail de usuário ativo ou de convite válido. Quem já tem
  // senha liga a conta Google pelo mesmo e-mail, se o Google o confirmou.
  socialProviders: googleProvider,
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Sem cookie cache: suspender ou desativar o usuário vale na próxima requisição.
    cookieCache: { enabled: false },
    additionalFields: {
      location: { type: "string", required: false, input: false },
      twoFactorPending: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  user: {
    additionalFields: {
      status: { type: "string", input: false, returned: true },
      personId: { type: "string", required: false, input: false },
      lastLoginAt: { type: "date", required: false, input: false },
      termsVersion: { type: "string", required: false, input: false },
      isSupportAgent: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  rateLimit: {
    // Limite por IP; o bloqueio por e-mail após 5 erros fica em lib/login-lock.ts.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
      "/reset-password": { window: 15 * 60, max: 10 },
      "/two-factor/send-otp": { window: 15 * 60, max: 5 },
      "/two-factor/verify-totp": { window: 60, max: 10 },
      "/two-factor/verify-otp": { window: 60, max: 10 },
      "/two-factor/verify-backup-code": { window: 60, max: 10 },
    },
  },
  advanced: {
    // IDs gerados pelo Prisma (cuid), como no resto do banco.
    database: { generateId: false },
    // IP como o Fastify o resolve (trustProxy), também em Session.ipAddress (RF-MC04).
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.request && BLOCKED_PATHS.has(ctx.path)) {
        throw APIError.from("NOT_FOUND", { code: "NOT_FOUND", message: "Rota não disponível." });
      }

      // Bloqueio por e-mail (A6). A resposta é a mesma para e-mail com ou sem usuário (RF-LG03).
      if (ctx.path === "/sign-in/email") {
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "");
        const lockedUntil = email ? await findLoginLock(email) : null;

        if (lockedUntil) {
          throw APIError.from("TOO_MANY_REQUESTS", { code: LOGIN_LOCKED_CODE, message: loginLockedMessage(lockedUntil) });
        }
        return;
      }

      // Regras de senha do iEzer também na redefinição (e-mail e nome da igreja).
      // Tamanho e senhas vazadas ficam com o Better Auth e o plugin haveIBeenPwned.
      if (ctx.path === "/reset-password") {
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
        return;
      }

      // Sessão do Google com 2FA pendente só envia e confere o código. E o 2FA obrigatório
      // (RF-CV07, RF-MC03) não pode ser desligado.
      if (ctx.path.startsWith("/two-factor/") && ctx.path !== "/two-factor/send-otp" && !TWO_FACTOR_VERIFY_PATHS.has(ctx.path)) {
        const current = await getSessionFromCtx(ctx);
        if (!current) return;

        if ((current.session as { twoFactorPending?: boolean }).twoFactorPending) {
          throw APIError.from("FORBIDDEN", { code: TWO_FACTOR_REQUIRED_CODE, message: TWO_FACTOR_REQUIRED_MESSAGE });
        }

        if (ctx.path === "/two-factor/disable" && (await requiresTwoFactor(current.user.id))) {
          throw APIError.from("FORBIDDEN", {
            code: "TWO_FACTOR_MANDATORY",
            message: "Quem tem permissões protegidas não pode desligar a verificação em duas etapas.",
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "").trim().toLowerCase();
        if (!email) return;

        // Senha certa (com ou sem desafio do 2FA) zera os erros seguidos.
        if (!isAPIError(ctx.context.returned)) {
          await clearLoginFailures(email);
          return;
        }

        // Falha de login (o sucesso é gravado na criação da sessão). Sem autor: a tentativa
        // não está autenticada.
        const error = ctx.context.returned;
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
        const reason = typeof error.body?.code === "string" ? error.body.code : error.status;

        await auditLogin("login_falhou", user?.id ?? null, ctx.headers, {
          actorUserId: null,
          description: user ? undefined : `E-mail sem usuário: ${email}`,
          after: { reason },
        });

        if (reason !== "INVALID_EMAIL_OR_PASSWORD") return;

        const lockedUntil = await recordLoginFailure(email);
        if (lockedUntil && user) {
          await auditLogin("login_bloqueado", user.id, ctx.headers, { actorUserId: null, after: { lockedUntil } });
          const church = await findUserChurch(user.id);
          await trySendMail(loginLockedNotice({ to: email, name: user.name, churchName: church?.name ?? null }));
        }
        return;
      }

      // Código certo numa sessão do Google com 2FA pendente: a sessão passa a valer, e o login
      // é registrado agora.
      if (TWO_FACTOR_VERIFY_PATHS.has(ctx.path) && !isAPIError(ctx.context.returned)) {
        const token = (ctx.context.returned as { token?: unknown } | undefined)?.token;
        if (typeof token !== "string") return;

        const { count } = await prisma.session.updateMany({
          where: { token, twoFactorPending: true },
          data: { twoFactorPending: false },
        });
        if (count === 0) return;

        const session = await prisma.session.findUnique({ where: { token }, select: { userId: true } });
        if (session) await recordLogin(session.userId, ctx.headers);
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Usuário só nasce com convite válido para o e-mail (RF-LG02). O aceite por senha cria a
        // conta fora do Better Auth; esta trava vale para o login pelo Google, que já cria o
        // usuário com a pessoa do convite. As atribuições entram ao abrir a sessão.
        before: async (user) => {
          const invite = await prisma.invite.findFirst({
            where: { email: user.email.toLowerCase(), status: "PENDENTE", expiresAt: { gt: new Date() } },
            select: { person: { select: { id: true, name: true } } },
          });

          if (!invite || !user.emailVerified) {
            throw APIError.from("FORBIDDEN", { code: INVITE_REQUIRED_CODE, message: INVITE_REQUIRED_MESSAGE });
          }

          return {
            data: {
              ...user,
              name: invite.person.name,
              personId: invite.person.id,
              status: "ATIVO",
              emailVerified: true,
            },
          };
        },
      },
      update: {
        // 2FA ligado ou desligado pelo próprio usuário (RF-MC03): log e alerta. A redefinição
        // pelo admin (RF-RS05) grava o próprio registro.
        after: async (user, context) => {
          const path = context?.path;
          if (!path?.startsWith("/two-factor/")) return;

          const disabled = path === "/two-factor/disable";
          if (!disabled && !user.twoFactorEnabled) return;

          await recordAccountEvent({
            actor: headerActor(context?.headers, user.id),
            userId: user.id,
            action: disabled ? "desativar_2fa" : "ativar_2fa",
            notice: (target) => twoFactorChangedNotice({ ...target, change: disabled ? "desativada" : "ativada" }),
          });
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { status: true, twoFactorEnabled: true },
          });

          if (user?.status !== "ATIVO") {
            throw APIError.from("FORBIDDEN", {
              code: USER_INACTIVE_CODE,
              message: USER_INACTIVE_MESSAGE,
            });
          }

          // Primeiro acesso pelo Google: conclui o convite (atribuições e log).
          if (isCallbackPath(context?.path)) {
            const { inviteService } = await import("../modules/acesso/convites/routes.js");
            await inviteService.completeForGoogleUser(session.userId, {
              ip: context?.headers?.get(CLIENT_IP_HEADER) ?? null,
              userAgent: context?.headers?.get("user-agent") ?? null,
            });
          }

          return {
            data: {
              ...session,
              location: approximateLocation(context?.headers),
              // O Google não dispensa o 2FA do iEzer (A3 revisto): a sessão só vale depois do código.
              twoFactorPending: isCallbackPath(context?.path) && user.twoFactorEnabled,
            },
          };
        },
        after: async (session, context) => {
          const path = context?.path;
          const pending = (session as { twoFactorPending?: boolean }).twoFactorPending === true;
          let isLogin = false;

          if (path === "/sign-in/email") {
            // Com 2FA, o plugin troca esta sessão pelo desafio; o login conta na verificação.
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { twoFactorEnabled: true } });
            isLogin = !user?.twoFactorEnabled;
          } else if (isCallbackPath(path)) {
            isLogin = !pending;
          } else if (path && TWO_FACTOR_VERIFY_PATHS.has(path)) {
            // Na configuração do 2FA o plugin também recria a sessão; isso não é login.
            isLogin = TWO_FACTOR_COOKIE.test(context?.headers?.get("cookie") ?? "");
          }

          if (isLogin) await recordLogin(session.userId, context?.headers);
        },
      },
      delete: {
        // Só o "Sair" do usuário; sessões encerradas pelo iEzer já têm a própria entrada.
        after: async (session, context) => {
          if (context?.path !== "/sign-out") return;
          await auditLogin("logout", session.userId, context.headers);
        },
      },
    },
  },
  plugins: [
    haveIBeenPwned(),
    // 2FA (RF-LG04, RF-MC03): app autenticador (TOTP), código por e-mail (10 min) e 10 códigos
    // de recuperação. Quem só usa Google liga e desliga sem senha. Bloqueio após 5 erros.
    twoFactor({
      issuer: "iEzer",
      allowPasswordless: true,
      otpOptions: {
        period: TWO_FACTOR_CODE_TTL_MINUTES,
        storeOTP: "hashed",
        sendOTP: async ({ user, otp }) => {
          const church = await findUserChurch(user.id);
          await trySendMail(twoFactorCodeEmail({ to: user.email, name: user.name, churchName: church?.name ?? null, code: otp }));
        },
      },
      backupCodeOptions: { amount: 10 },
      accountLockout: { maxFailedAttempts: 5, durationSeconds: 15 * 60 },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;

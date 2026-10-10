# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Backend API for the iEzer platform (church management: registrations, finance, reports). Fastify 5 + Prisma 6 + Postgres on Supabase, deployed on Render. Node 22, ESM (`"type": "module"`). Domain language is Portuguese (routes, enums, user-facing messages); code identifiers are English.

Companion frontend lives in a separate repo, `iezer-front` (Vite dev server on port 517x).

## Commands

```bash
npm install            # also runs `prisma generate` (postinstall)
npm run dev            # tsx watch src/server.ts → http://localhost:3333
npm run build          # tsc → dist/
npm start              # node dist/server.js
npm run typecheck      # tsc (lint is the same command; no ESLint/formatter configured)
npm run prisma:migrate # prisma migrate dev
npm run prisma:push    # prisma db push
npm run prisma:studio
```

There is no test suite yet. CI (`.github/workflows/ci.yml`) runs `npm run lint`, `typecheck` and `build` on pushes to `main`/`develop` and on PRs.

Healthchecks: `GET /health` and `GET /healthz` (the latter used by Render).

## Environment

`src/config/env.ts` validates `process.env` with Zod at import time — the app crashes on startup if `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL` or `BETTER_AUTH_SECRET` (32+ chars) are missing. `BETTER_AUTH_URL` is the API origin as the browser sees it (in production, the front's domain, which proxies `/api/*` to Render). `RESEND_API_KEY`/`EMAIL_FROM` are optional: without a key, transactional e-mails (`src/lib/mailer.ts`) are logged (with links in dev) instead of sent. Links in e-mails point to `WEB_ORIGIN`. See `.env.example`. `DATABASE_URL` is the Supabase pooler (pgbouncer); `DIRECT_URL` is used by Prisma for migrations. `WEB_ORIGIN` is the allowed CORS origin; `localhost`/`127.0.0.1` on ports 5170–5179 are always allowed (`src/app.ts`).

## Architecture

- `src/server.ts` → `buildApp()` in `src/app.ts` (CORS, `@fastify/sensible`, global error handler that maps Supabase/Prisma connection failures to 503 with Portuguese messages).
- All business routes are mounted under `/api` via `src/modules/index.ts`. `/auth/*` is the Better Auth handler (public, config in `src/lib/auth.ts`; password reset with hashed tokens, sign-up disabled, a `user.create.before` hook that requires a valid invite) and `/convites/:token` is the public invite page/acceptance (`src/modules/convites/`, IP rate limit in `src/lib/rate-limit.ts`); everything else is registered inside a scope with the `requireSession` hook (`src/lib/require-session.ts`: 401 without session, 403 `USER_INACTIVE` for non-ATIVO users, sets `request.user`/`request.session`): `/me`, `/cadastro`, `/financeiro`, `/relatorios`, `/modulos` (placeholders for planned modules). Each business module's `routes.ts` exposes a `GET /overview` and registers its sub-sections.
- API contract (routes added since Sprint 2): `docs/api-contrato.md`. Test users: `npm run user:create -- <email> <nome> <senha> [status]` (public sign-up is disabled).
- Data routes (`/pessoas`, `/cadastro`, `/financeiro`, `/relatorios`, `/organizacao`, `/acesso/{perfis,convites,usuarios,onboarding}`) sit in a nested scope with `resolveOrganization` (`src/lib/access.ts`): 403 `TERMS_REQUIRED` until the user accepts the current `TERMS_VERSION` (`src/lib/terms.ts`, `POST /me/termos`); active org from `X-Organization-Id` (+ `X-Organization-Scope: todas` from the sede), checked against the user's assignments; sets `request.access`. Church-wide actions use `requireChurchPermission` (permission at the sede); cross-org screens filter with `organizationIdsWith`. Each route declares `{ preHandler: requirePermission("key", ...) }` (any-of). Controllers pass `getRequestContext(request)` (church id, read/write org ids, permissions, audit actor) to services. Business errors throw `AppError(status, code, message, details?)`; the global handler sends `{ statusCode, code, message, ...details }` and maps `ZodError` to 400 `VALIDATION_ERROR`. Permission catalog: `src/modules/acesso/permissoes/catalog/` (one file per module). Test access: `npm run acesso:seed`, `npm run user:assign -- <email> <PASTOR|TESOUREIRO|SECRETARIO> [slug]`. New church + first admin invite: `npm run igreja:criar -- <file.json>` (format in `scripts/create-church.ts`).
- `src/lib/prisma.ts` exports a singleton `PrismaClient` (cached on `globalThis` outside production).

### Feature slice pattern

Every CRUD section (e.g. `src/modules/financeiro/contas-a-receber/`, `src/modules/cadastro/fornecedores/`) has the same five files — copy an existing one when adding a section:

- `schemas.ts` — Zod schemas for body/params/query plus inferred types. Messages in Portuguese. IDs validated as `cuid()`. Empty strings preprocessed to `undefined`.
- `repository.ts` — the only layer that touches `prisma`; builds `where` filters (always `organizationId: { in: organizationIds }`), `include`s relations, converts amounts to `Prisma.Decimal`; write methods take an optional `db` (transaction client).
- `service.ts` — business logic and DTO mapping (`Decimal` → number, `Date` → ISO string, flattened relation names like `categoryName`). Receives `RequestContext`; writes run inside `runAudited` and log before/after DTOs; creates use `requireWriteOrganization`. Throws a custom `XxxNotFoundError`.
- `controller.ts` — class with arrow-function handlers; parses input with the schemas, catches the not-found error and returns `reply.notFound(...)`.
- `routes.ts` — instantiates repository → service → controller at module load and wires the endpoints; registered in the parent module's `routes.ts`.

List endpoints return `{ items }`. Payables/receivables support recurrence (creating N installments sharing a `recurrenceGroupId`, delete with `?scope=series`) and settlement (`PATCH /:id/baixar`).

### Database

Schema in `prisma/schema.prisma`; migrations in `prisma/migrations/` are hand-named by date (`YYYYMMDD_description`), starting from `20260801_baseline`. Write data-preserving SQL by hand (renames, backfills) instead of trusting `migrate diff` blindly. Enum values are Portuguese (`PENDENTE`, `PAGO`, `RECEBIDO`, `MENSAL`...).

- `Organization` is two-level (sede → congregações via `parentId`); `OrganizationContact` holds the account owner and LGPD officer. Every business table has a required `organizationId`; repositories take the request's organization ids (`DEFAULT_ORGANIZATION_ID` in `src/lib/organization.ts` is only a script default).
- `Person` (formerly `Member`) is the people table, served by `src/modules/pessoas/` (`/pessoas`): bond (vínculo) and status (situação) are separate enums; minimum fields per bond and the under-18 guardian/consent rule live in `pessoas/rules.ts`. `Family`/`FamilyMember` (one family per person), `FollowUp`, `PersonConsent`, `ChurchListItem` (church lists stored on the sede; `npm run pessoas:seed`). Receivables expose `personId`/`personName` (`/cadastro/membros` was removed in Sprint 5).
- `User`, `Session`, `Account`, `Verification`, `TwoFactor` follow the Better Auth schema (email/password login since Sprint 2); `User.personId` is optional and unique. `AuditLog` has author, org, target, before/after, IP and user agent; every write goes through `runAudited` (`src/lib/audit.ts`). Interactive `$transaction` works on the pooler.
- `AccessProfile` (owned by the sede, `factoryKey` for factory profiles) + `AccessProfilePermission` (catalog keys) + `UserAssignment` (user × profile × organization).
- `Invite` + `InviteAssignment`: token stored only as SHA-256 (`src/lib/tokens.ts`), 72h, single use; resend swaps the hash. One pending invite per e-mail (partial unique index in SQL). Accepting creates User + credential Account + assignments in one `runAudited` (outside Better Auth), then signs in via `auth.api.signInEmail`. Login e-mail is unique across churches (RF-CV08, `assertLoginEmailAvailable`). Password rules beyond length/HIBP (no e-mail, no church name) in `src/lib/password-rules.ts`.

## Planning docs

Read `docs/plano-implantacao.md` before starting any task on access or people features.

- `docs/plano-implantacao.md` — task-by-task implementation plan (Acesso e Pessoas) with working rules: one task/branch/PR at a time, propose a plan first, record API contracts and decisions in its "Registro" section, update the task checkbox when done.
- `docs/prd/acesso.md`, `docs/prd/pessoas.md` — PRDs (copies of claude.ai Docs; the Doc is the source of truth), referenced by requirement IDs (e.g. RT-AB02).
- Already decided: Better Auth only for login, password, Google, 2FA and sessions (no `organization`/`admin` plugins); organizations, access profiles, permissions, invites and audit are iEzer tables (PRD Acesso, A22 and RT-AB01).

## Rules

- Every route checks permission on the server; hiding things in the front is only UX.
- Civil dates (birth, admission, conversion) are `@db.Date`, never `DateTime`; the API reads/writes them as `"YYYY-MM-DD"` (`src/lib/civil-date.ts`).
- Phones are stored as digits with country code (`normalizePhone`, `src/lib/phone.ts`) for Mensageria; the front masks them for display (exception to the front's `PhoneInput` pattern). CPF stored as 11 digits, check digit validated (`src/lib/cpf.ts`).
- The user tests visually in the browser — don't run Playwright/screenshots unless asked.
- To undo a change, revert it by manual edit — never `git checkout`/`reset`/`restore` on files with uncommitted work.
- There is a single Supabase database (free plan, no backups) shared by local dev and the Render deploy. Any command that can reset or wipe it (`prisma migrate reset`, `migrate dev`, `db push --force-reset`, `migrate diff --shadow-database-url`, DROP/TRUNCATE) must be asked first and wait for confirmation. Apply migrations with `prisma migrate deploy`; draft SQL with `migrate diff --from-schema-datamodel <old schema copy> --to-schema-datamodel prisma/schema.prisma --script`.

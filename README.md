# iEzer Back

API base da plataforma iEzer.

## Stack

- Node.js
- Fastify
- Prisma
- Postgres / Supabase
- Render

## Estrutura

```text
src/
  config/
  modules/
prisma/
```

## Módulos preparados

- Login
- Cadastro
- Financeiro
- Relatórios
- Placeholders para os demais módulos

## Rodar localmente

```bash
npm install
npm run dev
```

API local: `http://localhost:3333`

Healthcheck: `http://localhost:3333/health`

## Supabase

Este backend foi preparado para usar Supabase Postgres via Prisma.

Preencha `.env` com:

```env
DATABASE_URL="postgresql://postgres.rmblbewhqfsebxpkydai:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:5432/postgres?schema=public&sslmode=require"
DIRECT_URL="postgresql://postgres.rmblbewhqfsebxpkydai:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:5432/postgres?schema=public&sslmode=require"
SUPABASE_URL="https://rmblbewhqfsebxpkydai.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_jvmQWh6mATMMo-xhO7oKhw_j7RwX3D4"
SUPABASE_SERVICE_ROLE_KEY=""
```

Depois:

```bash
npm run prisma:generate
npm run prisma:push
```

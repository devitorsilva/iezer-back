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


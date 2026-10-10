# Contrato da API

Base: `/api`. Em dev, `http://localhost:3333/api`; em produção de teste, `https://iezer.vercel.app/api` (a Vercel repassa para o Render, ver `vercel.json` no front).
Atualizado a cada sprint com rotas novas ou alteradas. Rotas antigas de cadastro e financeiro seguem o padrão do `CLAUDE.md` (listas em `{ items }`).

## Autenticação e sessão (Sprint 2)

- Sessão por cookie `better-auth.session_token` (HttpOnly, SameSite=Lax; `__Secure-` em HTTPS). O front chama com `credentials: "include"`.
- Sessão de 7 dias, renovada a cada 1 dia de uso; sem cookie cache (status do usuário é conferido a cada requisição).
- **Todas as rotas de `/api` exigem sessão**, exceto `/api/auth/*`.

### Erros comuns a todas as rotas protegidas

| Status | Corpo | Quando |
| --- | --- | --- |
| 401 | `{ statusCode, code: "UNAUTHENTICATED", message }` | Sem sessão ou sessão expirada. Front leva ao login e volta à tela de origem |
| 403 | `{ statusCode, code: "USER_INACTIVE", message: "Seu acesso foi desativado. Fale com o administrador da sua igreja." }` | Usuário `SUSPENSO` ou `DESATIVADO` |

### `/api/auth/*` — Better Auth (público)

Rotas do Better Auth 1.7; o front usa `createAuthClient` de `better-auth/react`. Usadas hoje:

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/api/auth/sign-in/email` | `{ email, password }` | 200 `{ user, token, redirect }` + cookie |
| POST | `/api/auth/sign-out` | — | 200 `{ success: true }`, apaga o cookie |
| GET | `/api/auth/get-session` | — | `{ session, user }` ou `null` |

Erros do login (`{ code, message }` em inglês; o front traduz):

| Status | `code` | Mensagem no front |
| --- | --- | --- |
| 401 | `INVALID_EMAIL_OR_PASSWORD` | "E-mail ou senha incorretos." (RF-LG03) |
| 400 | `INVALID_EMAIL` / validação | "E-mail ou senha incorretos." |
| 403 | `USER_INACTIVE` | mensagem do back (RF-LG06) |
| 429 | — | "Muitas tentativas seguidas..." (5 por minuto por IP; só em produção) |

Cadastro público desligado (`disableSignUp`) até a Sprint 6 (convite). Usuários de teste: `npm run user:create -- <email> <nome> <senha> [ATIVO|DESATIVADO|SUSPENSO]`.

### `GET /api/me`

```json
{
  "user": { "id": "cuid", "name": "string", "email": "string", "image": "string|null", "status": "ATIVO" },
  "person": { "id": "cuid", "name": "string" } | null
}
```

Sprint 3 acrescenta organizações e permissões por organização (RT-AB04).

## Organização ativa e permissões (Sprint 3)

### Headers

| Header | Valor | Efeito |
| --- | --- | --- |
| `X-Organization-Id` | id da sede ou congregação | Organização ativa. Sem o header, a primeira que o usuário alcança |
| `X-Organization-Scope` | `todas` | Só com a sede: lê sede + congregações com as permissões da sede. Criar responde 400 `ORGANIZATION_REQUIRED` |

Permissões efetivas numa organização = perfis atribuídos ali + perfis na sede (que alcançam as congregações). Conferidas a cada requisição: mudança vale na próxima ação, sem novo login.

### Erros novos

| Status | `code` | Quando |
| --- | --- | --- |
| 403 | `NO_ORGANIZATION` | Usuário sem atribuição em nenhuma organização ativa |
| 403 | `ORGANIZATION_FORBIDDEN` | Header aponta para organização fora do alcance (ou `todas` sem ser sede) |
| 403 | `PERMISSION_DENIED` | Falta a permissão da rota. Corpo traz `permission` e `permissionName`; `message` = `Você não tem a permissão "<nome>".` |
| 400 | `ORGANIZATION_REQUIRED` | Criar em "Todas as congregações" |
| 400 | `INVALID_REFERENCE` | Lançamento aponta para categoria, fornecedor, membro ou conta de outra organização |

Registro de outra organização (fora do escopo de leitura) responde 404, como inexistente.

### Permissão por rota

| Rota | GET | POST / PUT / PATCH | DELETE |
| --- | --- | --- | --- |
| `/financeiro/contas-a-pagar` | `financeiro.pagar.ver` | `financeiro.pagar.editar` (inclui `/baixar`) | `financeiro.excluir` |
| `/financeiro/contas-a-receber` | `financeiro.receber.ver` | `financeiro.receber.editar` (inclui `/baixar`) | `financeiro.excluir` |
| `/cadastro/{centro-de-custo,bancos-contas,categorias,fornecedores}` | qualquer de `financeiro.pagar.ver`, `financeiro.receber.ver`, `financeiro.cadastros.editar` | `financeiro.cadastros.editar` | `financeiro.cadastros.editar` |
| `/cadastro/membros` | `pessoas.ver` | POST `pessoas.criar`; PUT `pessoas.editar` | `pessoas.apagar_registro` |
| `/acesso/perfis*` | `acesso.perfis.gerenciar` | `acesso.perfis.gerenciar` | — |

`/me`, `/acesso/permissoes`, `/modulos` e os `/overview` pedem só sessão. Em contas a receber, `memberName` volta `null` para quem não tem `pessoas.ver`.

### `GET /api/me` (alterado)

Acrescenta `organizations` (sede primeiro, só se houver perfil nela; depois congregações por nome):

```json
{
  "user": { "...": "igual à Sprint 2" },
  "person": null,
  "organizations": [
    { "id": "cuid", "name": "Sede", "type": "SEDE", "parentId": null, "permissions": ["financeiro.pagar.ver", "pessoas.ver"] }
  ]
}
```

### `GET /api/acesso/permissoes`

Catálogo fixo (RT-AB05). `{ items: [{ key, name, description, module, moduleName, protected, dependsOn: string[], group: string | null }] }`. `group` junta chaves mostradas como um switch só (`pessoas.notas_pastorais`).

### `GET /api/acesso/perfis`

Perfis da igreja da organização ativa: `{ items: [{ id, name, description, factoryKey: "PASTOR"|"TESOUREIRO"|"SECRETARIO"|null, permissions: string[], assignmentCount, createdAt, updatedAt }] }`.

### `POST /api/acesso/perfis/:id/restaurar`

Volta as permissões de um perfil de fábrica ao padrão (nome mantido). Responde o perfil.

| Status | `code` | Quando |
| --- | --- | --- |
| 400 | `NOT_FACTORY_PROFILE` | Perfil criado pela igreja |
| 403 | `PROTECTED_PERMISSION` | A restauração concederia protegida que o autor não tem |
| 409 | `LAST_ADMIN` | A igreja ficaria sem usuário ativo com `acesso.perfis.gerenciar` |
| 404 | — | Perfil de outra igreja ou inexistente |

### Auditoria

Toda criação, edição, baixa e exclusão nas rotas acima grava `AuditLog` na mesma transação: autor, organização do registro, módulo (`FINANCEIRO`, `CADASTRO`, `PESSOAS`, `ACESSO`), ação (`criar`, `editar`, `baixar`, `excluir`, `restaurar_perfil`), alvo (`Payable`, `Receivable`, `Category`, `Supplier`, `CostCenter`, `BankAccount`, `Person`, `AccessProfile`), `before`/`after` (DTO da API), IP e user agent. Séries recorrentes: um registro por parcela.

Scripts: `npm run acesso:seed` (perfis de fábrica nas sedes sem eles) e `npm run user:assign -- <email> <PASTOR|TESOUREIRO|SECRETARIO> [slug]` (sede piloto por padrão).

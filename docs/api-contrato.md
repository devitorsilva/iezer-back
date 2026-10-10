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

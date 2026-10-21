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

Cadastro público desligado (`disableSignUp`): conta nova só pelo aceite do convite (Sprint 6). Usuários de teste: `npm run user:create -- <email> <nome> <senha> [ATIVO|DESATIVADO|SUSPENSO]`.

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
| 400 | `INVALID_REFERENCE` | Lançamento aponta para categoria, fornecedor, pessoa ou conta de outra organização |

Registro de outra organização (fora do escopo de leitura) responde 404, como inexistente.

### Permissão por rota

| Rota | GET | POST / PUT / PATCH | DELETE |
| --- | --- | --- | --- |
| `/financeiro/contas-a-pagar` | `financeiro.pagar.ver` | `financeiro.pagar.editar` (inclui `/baixar`) | `financeiro.excluir` |
| `/financeiro/contas-a-receber` | `financeiro.receber.ver` | `financeiro.receber.editar` (inclui `/baixar`) | `financeiro.excluir` |
| `/cadastro/{centro-de-custo,bancos-contas,categorias,fornecedores}` | qualquer de `financeiro.pagar.ver`, `financeiro.receber.ver`, `financeiro.cadastros.editar` | `financeiro.cadastros.editar` | `financeiro.cadastros.editar` |
| `/acesso/perfis*` | `acesso.perfis.gerenciar` | `acesso.perfis.gerenciar` | — |

`/me`, `/acesso/permissoes`, `/modulos` e os `/overview` pedem só sessão. Em contas a receber, `personName` volta `null` para quem não tem `pessoas.ver`.

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

Perfis da igreja da organização ativa: `{ items: [{ id, name, description, factoryKey: "PASTOR"|"TESOUREIRO"|"SECRETARIO"|null, permissions: string[], userCount, inviteCount, createdAt, updatedAt }] }`. `assignmentCount` saiu na Sprint 8 (ver abaixo).

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

## Pessoas (Sprint 4)

Em `/api/pessoas`, com organização ativa (headers da Sprint 3). Datas civis sempre `"AAAA-MM-DD"`; telefones gravados só com dígitos e DDI (`5511987654321`) — o front mascara na exibição e pode mandar mascarado; CPF só com dígitos. Em qualquer campo opcional, `""` ou `null` limpa; ausente não mexe.

### Erros novos

| Status | `code` | Corpo extra | Quando |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `issues: [{ path, message }]` | Corpo ou query inválidos (vale para **todas** as rotas; antes respondia 500). `message` = primeira mensagem |
| 400 | `BOND_REQUIREMENTS` | `missingFields`, `target?: "guardian"` | Falta o mínimo do vínculo (ver tabela) |
| 400 | `GUARDIAN_REQUIRED` | `missingFields` (`guardian`, `consent`) | Menor de 18 anos (ou Membro em formação) sem responsável ou sem consentimento |
| 400 | `INVALID_GUARDIAN` | — | Responsável menor de idade, ou com papel Filho/Outro na família dele |
| 400 | `INVALID_REFERENCE` | — | Forma de admissão fora das listas da igreja, responsável ou congregação fora do alcance |
| 409 | `CPF_CONFLICT` | `personId` | CPF já cadastrado nas organizações que o usuário lê |
| 409 | `PERSON_HAS_LINKS` | `links: ("receivables"\|"family"\|"user"\|"followUps"\|"consentsGiven")[]` | Apagar pessoa com vínculos |

### Mínimo por vínculo (`missingFields`)

| Vínculo (`bond`) | Exige |
| --- | --- |
| `VISITANTE` | `contact` (celular, telefone ou email; dispensado para menor) |
| `NOVO_CONVERTIDO` | `fullName` (2+ palavras), `conversionDate` |
| `CONGREGADO` | `fullName` |
| `MEMBRO` | `fullName`, `admissionMethodId`, `admissionDate` |
| `MEMBRO_EM_FORMACAO` | `fullName`, `birthDate`, `guardian` |
| Menor de 18 (qualquer) | `guardian` (Responsável ou Cônjuge maior de idade na família) e `consent` |

Situação (`status`): `ATIVO`, `INATIVO`, `TRANSFERIDO`, `DESLIGADO`, `FALECIDO` — muda só por ações (Sprint 9).

### Rotas

| Método | Rota | Permissão | Resposta |
| --- | --- | --- | --- |
| GET | `/pessoas` | `pessoas.ver` | `{ items: PersonListItem[], total, page, pageSize }` |
| GET | `/pessoas/duplicados` | `pessoas.ver` | `{ items: Duplicate[] }` |
| GET | `/pessoas/listas` | `pessoas.ver` | `{ items: [{ id, type, name, sortOrder }] }` |
| GET | `/pessoas/:id` | `pessoas.ver` | `Person` |
| POST | `/pessoas` | `pessoas.criar` | 201 `Person` |
| PATCH | `/pessoas/:id` | `pessoas.editar` | `Person` |
| DELETE | `/pessoas/:id` | `pessoas.apagar_registro` | 204 |

**`GET /pessoas`** (RT-B01) — query: `page` (1), `pageSize` (20, máx. 100), `q` (nome e "como prefere ser chamado" sem acento, todas as palavras; email; CPF a partir de 3 dígitos; telefone a partir de 4), `vinculo` e `situacao` (lista separada por vírgula; **sem `situacao` vem só `ATIVO`**, `situacao=todas` traz tudo), `organizacao` (id dentro do escopo), `idadeMin`, `idadeMax`, `aniversarioMes` (1–12), `batizado`, `familia` (`true` = tem família), `sexo` (`MASCULINO`|`FEMININO`), `semContato=true`, `sort` (`nome`, `-nome`, `cadastro`, `-cadastro`, `nascimento`, `-nascimento`, `aniversario` — mês e dia de nascimento, sem data por último; padrão `nome`).

`PersonListItem`: `{ id, name, preferredName, sex, birthDate, age, bond, status, organizationId, organizationName, mobilePhone, mobileIsWhatsapp, email, familyId, createdAt }`.

**`GET /pessoas/duplicados`** (RF-C02) — query: `cpf`, `email`, `celular`, `nome` + `nascimento`, `ignorar` (id da própria pessoa, ao editar). Busca só nas organizações que o usuário lê. `Duplicate`: `{ id, name, preferredName, bond, status, birthDate, organizationId, organizationName, reasons: ("CPF"|"EMAIL"|"CELULAR"|"NOME_NASCIMENTO")[], blocking }` — `blocking` quando o CPF bate (o front oferece abrir o perfil).

**`GET /pessoas/listas`** — listas da igreja (gravadas na sede, valem nas congregações), ativas, por `type`: `FORMA_ADMISSAO`, `MOTIVO_INATIVACAO`, `MOTIVO_DESLIGAMENTO`, `CARGO_ECLESIASTICO`, `COMO_CONHECEU`.

**`Person`** (detalhe; contribuições ficam fora, RT-B04):

```json
{
  "id": "cuid", "organizationId": "cuid", "organizationName": "Sede",
  "name": "Maria Souza", "preferredName": "Mari", "sex": "FEMININO", "birthDate": "1985-03-15", "age": 41,
  "maritalStatus": "CASADO", "cpf": "52998224725", "otherDocumentType": "RG", "otherDocumentNumber": "12.345",
  "mobilePhone": "5511987654321", "mobileIsWhatsapp": true, "secondaryPhone": null, "email": "maria@exemplo.com",
  "postalCode": "01001000", "street": "...", "number": "...", "complement": null, "district": "...", "city": "...", "state": "SP",
  "bond": "MEMBRO", "status": "ATIVO",
  "firstVisitDate": null, "conversionDate": null, "presentationDate": null,
  "isBaptized": true, "baptismDate": "2000-01-09", "baptismChurch": null, "infantBaptism": false, "professionOfFaithDate": null,
  "admissionMethodId": "cuid", "admissionMethodName": "Transferência por carta", "admissionDate": "2020-05-10", "originChurch": null,
  "cellName": null, "notes": null,
  "family": { "id": "cuid", "name": "Família Souza", "role": "RESPONSAVEL", "members": [{ "personId": "cuid", "name": "...", "preferredName": null, "role": "FILHO", "age": 8 }] },
  "consent": { "id": "cuid", "method": "PAPEL", "textVersion": "cadastro-2026-10", "givenAt": "ISO", "givenByPersonId": "cuid", "givenByName": "..." },
  "missingFields": [], "incomplete": false,
  "createdAt": "ISO", "updatedAt": "ISO"
}
```

`cellName` é legado, somente leitura. `incomplete`/`missingFields` sinalizam "cadastro incompleto" (pessoas migradas entram como Membro sem forma/data de admissão).

**`POST /pessoas`** (cadastro rápido, RF-C01/RF-C04) — corpo: `name`, `bond` (obrigatórios), `organizationId` (opcional; sede ou congregação no escopo; sem ele, a organização ativa — em "todas" sem ele dá 400 `ORGANIZATION_REQUIRED`), qualquer campo cadastral do `Person` (exceto `status`, `cellName`), mais:
- `guardian`: `{ personId }` ou `{ name, bond?: "VISITANTE", mobilePhone?, mobileIsWhatsapp?, email? }` (cadastrado na hora; também cumpre o mínimo do vínculo). A criança entra como Filho na família do responsável (criada como "Família <sobrenome>" se ele não tiver) e herda o endereço dele se vier sem endereço.
- `consent`: `{ method: "PAPEL"|"PLANILHA"|"DIGITAL", givenAt?: "AAAA-MM-DD" }` (padrão hoje). Obrigatório para menor (dado pelo responsável); opcional para adulto (dado pelo titular).

**`PATCH /pessoas/:id`** — campos cadastrais parciais (`name` e os mesmos do POST, sem `bond`, `organizationId`, `guardian`, `consent`). Não deixa tirar um dado exigido pelo vínculo nem tornar menor quem não tem responsável (400 com só os campos que a edição faria faltar); cadastro já incompleto continua editável.

**`DELETE /pessoas/:id`** — "Apagar registro" (RF-V05): só sem vínculos; o consentimento da própria pessoa sai junto.

Auditoria (módulo `PESSOAS`): `criar`, `editar`, `apagar_registro` (`Person`); `criar`, `adicionar_membro` (`Family`); `registrar_consentimento` (`PersonConsent`).

### `/cadastro/membros` (removida na Sprint 5)

A camada de compatibilidade saiu: o front usa `/pessoas` e o `PersonPicker`. A rota responde 404.

Recebíveis: `Receivable.personId` agora é `Restrict` (pessoa com lançamento não é apagada).

Script: `npm run pessoas:seed` (listas de fábrica nas sedes sem elas; idempotente).

## Sprint 5 — Contas a Receber com pessoa

`/financeiro/contas-a-receber` troca `memberId`/`memberName` por `personId`/`personName` (corpo e resposta) e passa a devolver `organizationId` (o `PersonPicker` busca na organização do lançamento quando a tela está em "todas"). No corpo, `personId: null` ou `""` desvincula a pessoa (antes não havia como desvincular na edição). Pessoa de outra organização continua dando 400 `INVALID_REFERENCE`.

## Sprint 6 — Convite, recuperação de senha e Organização

### Termos (RF-CV06, RF-LP07)

- `GET /me` ganha `terms: { version, accepted }`. Sem o aceite da versão atual (`TERMS_VERSION` em `src/lib/terms.ts`), o front mostra o aceite antes do app.
- `POST /me/termos` → `{ version, accepted: true }`. Fica no log como `aceitar_termos`, junto com a versão.
- Todas as rotas de dados (escopo `resolveOrganization`) respondem 403 `TERMS_REQUIRED` enquanto não houver aceite. `/me` e `/acesso/permissoes` continuam respondendo.

### Recuperação de senha (Better Auth, RF-RS01 a RF-RS03)

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/api/auth/request-password-reset` | `{ email }` | 200 `{ status: true }`, a mesma resposta exista ou não o e-mail |
| POST | `/api/auth/reset-password` | `{ token, newPassword }` | 200 `{ status: true }` |

- O e-mail leva ao link `${WEB_ORIGIN}/redefinir-senha/:token`, válido por 1h e de uso único. O token é guardado como hash (`verification.storeIdentifier: "hashed"`).
- Redefinir encerra **todas** as sessões e envia um e-mail de confirmação. Fica no log como `redefinir_senha`.
- Quem não tem senha (só Google) ganha a conta credential pelo mesmo fluxo.
- Erros (`{ code, message }`):
  - `WEAK_PASSWORD`: mensagem em português, recusa o e-mail ou o nome da igreja.
  - `PASSWORD_COMPROMISED`, `PASSWORD_TOO_SHORT`, `INVALID_TOKEN`: o front traduz.
  - 429: limite de 5 pedidos a cada 15 min por IP (em produção) e 3 e-mails por hora por endereço. Nesse caso o e-mail não sai, mas a resposta continua igual.

### Convite — rotas públicas (RF-CV05, RF-CV06)

**`GET /api/convites/:token`** (30 por minuto por IP):

```json
{
  "churchName": "string",
  "inviterName": "string|null",
  "personName": "string",
  "email": "string",
  "expiresAt": "ISO",
  "organizations": [{ "organizationName": "Sede", "profiles": ["Secretário"] }],
  "permissions": [{ "module": "pessoas", "moduleName": "Pessoas", "permissions": ["Ver pessoas", "..."] }],
  "termsVersion": "2026-10-10"
}
```

Erros:
- 404 `INVITE_INVALID`: link inexistente, já usado, cancelado ou substituído por um reenvio.
- 410 `INVITE_EXPIRED`.

**`POST /api/convites/:token/aceitar`** `{ password, acceptTerms: true }` (10 a cada 15 min por IP):
- Numa transação: cria o User (ATIVO, `emailVerified`, `personId`) e a senha, cria as atribuições do convite, marca o convite como aceito (uso único) e registra os termos.
- Depois faz o login e devolve o cookie: 200 `{ signedIn: true }`. Se o login falhar, devolve `signedIn: false` e o front manda para o login.
- Senha: 12 a 128 caracteres, não aparece em vazamentos (HIBP), não contém o e-mail nem o nome da igreja.
- Erros, todos 400 com `field: "password"` quando são da senha:
  - `WEAK_PASSWORD`, `PASSWORD_COMPROMISED`.
  - `VALIDATION_ERROR` (termos não aceitos).
  - 404 `INVITE_INVALID`, 410 `INVITE_EXPIRED`.
  - 409 `EMAIL_IN_USE`, 409 `PERSON_HAS_USER`.
- Log: `aceitar_convite` e `aceitar_termos`. O autor é o próprio usuário novo.

### `/acesso/convites` (RF-CV01 a RF-CV04, RF-RS04)

O convite expira em 72h. Só um convite pendente por e-mail no iEzer inteiro (índice parcial). Convites pendentes já expirados do mesmo e-mail ou pessoa são cancelados quando sai um convite novo.

| Método | Rota | Permissão | Corpo | Resposta |
| --- | --- | --- | --- | --- |
| GET | `/acesso/convites` | `acesso.usuarios.ver` ou `.gerenciar` | — | `{ items: Invite[] }`, pendentes e expirados com perfil nas organizações em que o usuário tem a permissão |
| POST | `/acesso/convites` | `acesso.usuarios.gerenciar` | `{ personId, assignments: [{ organizationId, profileIds[] }] }` | 201 `InviteResult` |
| POST | `/acesso/convites/:id/reenviar` | idem | `{ sendEmail?: boolean }` (padrão `true`) | `InviteResult`. Gera token novo e renova as 72h; o link anterior deixa de valer. `sendEmail: false` = "Copiar link" |
| POST | `/acesso/convites/:id/cancelar` | idem | — | `Invite` (`CANCELADO`) |
| PATCH | `/acesso/convites/:id/email` | idem | `{ email }` | `InviteResult`. Troca o e-mail do convite e da Pessoa e reenvia |

- `Invite`: `{ id, personId, personName, email, status: "PENDENTE"|"EXPIRADO"|"ACEITO"|"CANCELADO", expiresAt, createdAt, invitedByName, assignments: [{ organizationId, organizationName, profileId, profileName }] }`.
- `InviteResult`: `{ invite, link, emailSent }`. O link só aparece nessas respostas, porque o banco guarda apenas o hash do token.

Erros:
- 400 `INVALID_PERSON`.
- 400 `PERSON_EMAIL_REQUIRED`: o convite usa o e-mail da Pessoa.
- 409 `PERSON_HAS_USER`.
- 409 `USER_EXISTS`: o e-mail já é de um usuário desta igreja.
- 409 `EMAIL_IN_OTHER_CHURCH` (RF-CV08).
- 409 `INVITE_PENDING`.
- 400 `INVALID_PROFILE`, 400 `INVALID_ORGANIZATION` (organização desativada ou de outra igreja).
- 403 `PERMISSION_DENIED`: sem "Gerenciar usuários" naquela organização.
- 403 `PROTECTED_PERMISSION`: o perfil tem uma permissão protegida que quem convida não tem.
- 409 `INVITE_NOT_PENDING`.
- 404 quando o convite não existe.

Log: `criar_convite`, `reenviar_convite`, `gerar_link_convite`, `cancelar_convite`, `trocar_email_convite` (e `editar_pessoa` quando o e-mail da Pessoa muda).

### `/acesso/usuarios` (lista básica; ações na Sprint 8)

- `GET /acesso/usuarios` (`acesso.usuarios.ver` ou `.gerenciar`) → `{ items: [{ id, name, email, status, twoFactorEnabled, lastLoginAt, personId, personName, assignments[] }] }`. Só usuários e atribuições das organizações em que quem consulta tem a permissão.
- `PATCH /acesso/usuarios/:id/email` (`acesso.usuarios.gerenciar`) `{ email }` (RF-RS04):
  - Troca o e-mail do User e da Pessoa e encerra as sessões.
  - Avisa o e-mail antigo e manda ao novo um link de definir senha (redefinição de 1h).
  - Erros: 400 `OWN_ACCESS` (o próprio usuário), 400 `SAME_EMAIL`, mais os mesmos conflitos de e-mail do convite.
  - Log: `trocar_email_usuario`.

### `GET /acesso/onboarding` (`acesso.usuarios.ver` ou `.gerenciar`; RF-OB03, RF-OB04)

```json
{
  "checklist": {
    "congregationsReviewed": false,
    "secondAdminInvited": false,
    "secretaryInvited": false,
    "treasurerInvited": false,
    "peopleImported": false
  },
  "singleAdmin": true
}
```

- `secondAdminInvited`: dois ou mais admins somando usuários ativos e convites válidos com `acesso.perfis.gerenciar`.
- `secretaryInvited` e `treasurerInvited`: alguém (usuário ativo ou convite válido) com o perfil de fábrica correspondente.
- `singleAdmin`: só um usuário **ativo** com `acesso.perfis.gerenciar`.
- `peopleImported` fica `false` até a Sprint 11.

### `GET /acesso/perfis` (alterado)

Passa a aceitar `acesso.perfis.gerenciar` **ou** `acesso.usuarios.gerenciar`, porque o diálogo "Dar acesso" escolhe entre os perfis.

### `/organizacao` (RF-OR01, RF-OR03)

Todas as rotas exigem `organizacoes.gerenciar` **na sede** (`requireChurchPermission`): 403 `PERMISSION_DENIED`. Log no módulo `CONFIGURACOES`.

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/organizacao` | — | `{ id, name, cnpj, congregationsReviewedAt, congregations: [{ id, name, isActive, createdAt }], accountOwner, lgpdOfficer }` (contato: `{ name, jobTitle, email, phone }` ou `null`) |
| PATCH | `/organizacao` | `{ name?, cnpj? }`. CNPJ com DV; `""` ou `null` limpa | igual ao GET |
| POST | `/organizacao/congregacoes` | `{ name }` | 201 congregação |
| PATCH | `/organizacao/congregacoes/:id` | `{ name?, isActive? }` | congregação. Sem DELETE: desativar tira do seletor e mantém os dados |
| POST | `/organizacao/congregacoes-conferidas` | — | `{ congregationsReviewedAt }` |
| PUT | `/organizacao/encarregado-lgpd` | `{ name, jobTitle?, email, phone? }` | contato |
| DELETE | `/organizacao/encarregado-lgpd` | — | 204 |

- O responsável pela conta é só leitura (muda pelo back-office do iEzer).
- Erros: 409 `ORGANIZATION_NAME_TAKEN` (`field: "name"`, nome repetido na igreja), 409 `CHURCH_CNPJ_TAKEN` (`field: "cnpj"`, CNPJ de outra sede; desde a Sprint 17), 404 para congregação inexistente.
- CNPJ numérico ou alfanumérico desde a Sprint 17, gravado sem pontuação e em maiúsculas.

### Onboarding (RF-OB01, RF-OB02)

A igreja e o convite do primeiro admin são criados pelo back-office (`POST /api/admin/igrejas`, Sprint 17). O script `igreja:criar` foi removido.

### E-mail

`src/lib/mailer.ts` envia pelo Resend (`RESEND_API_KEY`, `EMAIL_FROM`) com remetente "Nome da Igreja via iEzer". Sem chave, o e-mail vai para o log: em dev com o link, em produção só destinatário e assunto.

## Sprint 7 — Perfil da pessoa e família

### `GET /pessoas/:id` (alterado)

`family.members[]` ganha `bond`, `status` e `isGuardian` (Responsável ou Cônjuge maior de idade, RF-F02): `{ personId, name, preferredName, role, age, bond, status, isGuardian }`.

### `PATCH /pessoas/:id` (alterado, RF-F03)

Aceita `applyToFamily: true`. Os campos do domicílio enviados no corpo (`postalCode`, `street`, `number`, `complement`, `district`, `city`, `state`, `secondaryPhone`) são copiados para os outros membros da família que o usuário enxerga, cada um com um `editar` no log. Vale a mesma regra do "não piorar": se a cópia tirar o mínimo do vínculo de alguém (ex.: o único contato), nada é salvo e a resposta é 400 `BOND_REQUIREMENTS` com `target: "family"`, `personId` e `missingFields`.

### Família (`pessoas.editar`, RF-F01, RF-F02, RT-B11)

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/pessoas/familias` | `{ name?, members: [{ personId, role }] }` (1 a 30, sem repetir) | 201 `Family` |
| PATCH | `/pessoas/familias/:id` | `{ name }` | `Family` |
| POST | `/pessoas/familias/:id/membros` | `{ personId, role }` | `Family` |
| PATCH | `/pessoas/familias/:id/membros/:personId` | `{ role }` | `Family` |
| DELETE | `/pessoas/familias/:id/membros/:personId` | — | `{ family: Family \| null }` (`null`: era o último e a família foi apagada) |

- `role`: `RESPONSAVEL`, `CONJUGE`, `FILHO`, `OUTRO`.
- `Family`: `{ id, name, organizationId, organizationName, members: FamilyMember[] }`. Sem `name`, vira "Família <sobrenome>" do primeiro responsável (ou da primeira pessoa). A família fica na organização da primeira pessoa; membros de congregações diferentes são aceitos.
- A família é visível se for de uma organização que o usuário lê ou tiver alguém dela; trocar papel e remover só valem para quem o usuário enxerga (senão 404).
- Erros:
  - 409 `PERSON_IN_FAMILY` (`personId`, `familyId`, `familyName`): a pessoa já está em outra família (uma por pessoa). Remova de lá primeiro.
  - 400 `GUARDIAN_REQUIRED` (`personIds`): a mudança deixaria sem responsável um menor de 18 anos ou Membro em formação (trocar o papel do único responsável, remover o responsável, remover o próprio menor).
  - 400 `INVALID_REFERENCE`: pessoa fora do alcance.
  - 404: família ou membro não encontrado.
- Log (módulo `PESSOAS`, alvo `Family`): `criar`, `renomear`, `adicionar_membro`, `trocar_papel`, `remover_membro`, `apagar`.
- **Filho a partir do responsável (RF-F04):** sem rota nova. `POST /pessoas` com `guardian: { personId }` põe a criança como Filho na família do responsável (cria a família se preciso) e copia o endereço quando ela vem sem endereço. Também vale para filho adulto (consentimento só é exigido de menor).

### `GET /pessoas/:id/contribuicoes` (`pessoas.contribuicoes.ver`, RT-B04)

`{ items: Contribution[], totalReceived }`. Recebíveis da pessoa nas organizações que o usuário lê, do vencimento mais recente para o mais antigo. `totalReceived` soma os `RECEBIDO` (valor baixado, ou o valor do lançamento).
`Contribution`: `{ id, description, source, organizationId, organizationName, categoryName, dueDate, amount, status: "RECEBIDO"|"PENDENTE"|"ATRASADO", settledAmount, settledAt, settlementMethod }` (`dueDate`/`settledAt` ISO de data e hora, como em Contas a Receber). 404 se a pessoa não estiver no alcance.

### `GET /pessoas/:id/acesso` (`acesso.usuarios.ver` ou `.gerenciar`, RF-US06)

`{ user: User | null, invite: Invite | null }`, nos formatos de `/acesso/usuarios` e `/acesso/convites`. As atribuições vêm só das organizações em que quem consulta tem a permissão. `invite` (pendente ou expirado) só vem quando não há usuário. 404 se a pessoa não estiver no alcance.

## Sprint 8 — Usuários e perfis de acesso

### Travas (RT-AB07, `src/modules/acesso/travas.ts`)

Valem em perfis, usuários e no aceite de convite:

- **Protegidas:** só quem tem a permissão protegida pode concedê-la ou retirá-la. Isso vale para um perfil (chave que entra ou sai) e para uma atribuição (perfil com protegida que entra ou sai). Erro 403 `PROTECTED_PERMISSION`.
- **Último admin:** a igreja não pode ficar sem usuário ativo com `acesso.perfis.gerenciar` (409 `LAST_ADMIN`). A trava só dispara se havia algum antes. Organização desativada não conta.
- **Próprio acesso:** ninguém edita as próprias atribuições, se desativa ou encerra as próprias sessões (400 `OWN_ACCESS`).
- **E-mails (depois do commit):**
  - quando alguém recebe uma protegida, inclusive por edição de perfil, restauração, troca de perfil, reativação ou aceite de convite, quem já a tinha recebe aviso;
  - quem perde `acesso.perfis.gerenciar` recebe aviso, e os admins que continuam também.

### `/acesso/perfis` (`acesso.perfis.gerenciar`, RF-PF01 a RF-PF04)

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/acesso/perfis` | `{ name, description?, permissions: string[] }` | 201 `AccessProfile`. Duplicar = POST com as permissões do original |
| PATCH | `/acesso/perfis/:id` | idem | `AccessProfile`. Perfil de fábrica também pode ser editado |
| DELETE | `/acesso/perfis/:id` | `{ moveToProfileId? }` | 204. Atribuições e convites pendentes vão para o destino |
| POST | `/acesso/perfis/:id/restaurar` | — | `AccessProfile` (agora com as travas de protegida ao conceder e ao retirar) |

- `permissions` é normalizado no back: o grupo inteiro (`pessoas.notas_pastorais.ver` + `.editar`) e as dependências (em cadeia) entram juntos. A resposta traz a lista final.
- `userCount`: usuários distintos. `inviteCount`: convites pendentes com o perfil.
- Erros:
  - 400 `UNKNOWN_PERMISSION` (`field: "permissions"`);
  - 409 `PROFILE_NAME_TAKEN` (`field: "name"`; o nome é único por igreja, sem diferenciar maiúsculas);
  - 409 `FACTORY_PROFILE` (excluir perfil de fábrica);
  - 409 `PROFILE_IN_USE` (excluir com usuários ou convites e sem `moveToProfileId`);
  - 400 `INVALID_PROFILE` (destino inexistente ou o próprio perfil);
  - os erros de trava acima.
- Log: `criar_perfil`, `editar_perfil`, `restaurar_perfil`, `excluir_perfil` (com o destino), antes e depois.

### `/acesso/usuarios` (`acesso.usuarios.gerenciar`, RF-US02, RF-US03, RF-US05)

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| PUT | `/acesso/usuarios/:id/atribuicoes` | `{ assignments: [{ organizationId, profileIds[] }] }` | `User` |
| POST | `/acesso/usuarios/:id/desativar` | — | `User` (`DESATIVADO`, sessões apagadas) |
| POST | `/acesso/usuarios/:id/reativar` | — | `User` (`ATIVO`, de `DESATIVADO` ou `SUSPENSO`) |
| POST | `/acesso/usuarios/:id/encerrar-sessoes` | — | `{ sessionsEnded }` (status não muda) |

- **Atribuições:**
  - o PUT substitui só as atribuições das organizações em que quem edita tem `acesso.usuarios.gerenciar`; as outras ficam como estão;
  - uma organização gerenciada que fica fora da lista perde as atribuições dali;
  - o usuário precisa terminar com ao menos uma atribuição (400 `NO_ASSIGNMENTS`, `field: "assignments"`).
- **Alcance:** desativar, reativar e encerrar sessões exigem `acesso.usuarios.gerenciar` em todas as organizações em que o usuário tem atribuição. Sem isso, 403 `PERMISSION_DENIED`.
- **Protegidas:** desativar e reativar também exigem as protegidas dos perfis do usuário (retirar ou conceder).
- **Outros erros:** 400 `INVALID_STATUS` (já está no status pedido); 404 para usuário fora do alcance.
- **Log:** `editar_acessos_usuario` (atribuições antes e depois), `desativar_usuario`, `reativar_usuario`, `encerrar_sessoes_usuario`.


## Sprint 9 — Ciclo de vida, acompanhamento e indicadores

Migração `20261013_ciclo_vida`: `PersonEvent` (linha do tempo), `Person.bondSince` e `Person.contactUpdatedAt`, `Organization.peopleSettings`.

### `GET /pessoas/:id` (alterado)

- `bondSince` (`"AAAA-MM-DD"`): desde quando está no vínculo atual. Vai para a data da promoção. No cadastro, vale a data que define o vínculo (primeira visita, conversão ou admissão) ou hoje.
- `contactUpdatedAt` (ISO): muda quando o PATCH altera celular, telefone, e-mail ou endereço, inclusive pelo `applyToFamily`.
- `lastFollowUp`: `{ id, date, type, note, authorName }` ou `null`.
- `promotionRequirements`: `{ [vínculo]: MissingField[] }`, para cada vínculo diferente do atual. Lista o que falta para promover, pela regra do "não piorar". `guardian` e `consent` não se resolvem no modal: vincule o responsável na aba Família.

### Ciclo de vida (RT-B02, RF-V01 a RF-V04)

Todas as datas são `"AAAA-MM-DD"`, obrigatórias e não podem ser futuras. `note` é opcional, com até 500 caracteres.

| Método | Rota | Permissão | Corpo | Situação de origem |
| --- | --- | --- | --- | --- |
| POST | `/pessoas/:id/promover` | `pessoas.promover_vinculo` | `{ bond, date, note?, name?, birthDate?, conversionDate?, admissionMethodId?, admissionDate? }` | Ativo |
| POST | `/pessoas/:id/inativar` | `pessoas.alterar_situacao` | `{ date, reasonId (MOTIVO_INATIVACAO), note? }` | Ativo |
| POST | `/pessoas/:id/transferir` | idem | `{ kind: "INTERNA", date, organizationId, note? }` ou `{ kind: "EXTERNA", date, churchName, letterIssued?, note? }` | Ativo, Inativo |
| POST | `/pessoas/:id/desligar` | idem | `{ date, reasonId (MOTIVO_DESLIGAMENTO), note? }` | Ativo, Inativo |
| POST | `/pessoas/:id/falecimento` | idem | `{ date, note? }` | qualquer, menos Falecido |
| POST | `/pessoas/:id/reativar` | idem | `{ date, note? }` | qualquer, menos Ativo |

**Resposta (200):** `{ person: PersonDetail, event: TimelineEvent, accessChange }`. `accessChange` pode ser:
- `"SUSPENDED"`: a ação suspendeu o acesso agora;
- `"STILL_SUSPENDED"`: a pessoa foi reativada, mas o acesso dela continua suspenso;
- `null`.

**Promover:**
- aceita qualquer vínculo diferente do atual, inclusive voltar um estágio para corrigir;
- os campos enviados são gravados na pessoa;
- `bondSince` passa a ser `date`.

**Transferência interna:**
- o destino precisa ser sede ou congregação ativa da igreja, entre as organizações em que o usuário tem `pessoas.alterar_situacao`;
- muda `organizationId` e mantém situação, acesso, família, lançamentos e acompanhamentos;
- o evento fica na organização de origem, com `details: { fromOrganizationId, fromOrganizationName, toOrganizationId, toOrganizationName }`.

**Transferência externa:** situação Transferido, com `details: { churchName, letterIssued }`.

**Suspensão automática (RF-US04, RT-AB13):** inativar, desligar, falecimento e transferência externa suspendem o usuário da pessoa, se ele estiver ATIVO.
- O status vira `SUSPENSO` e as sessões são apagadas, na mesma transação. As requisições seguintes dele dão 401.
- Depois do commit, os admins ativos (com `acesso.perfis.gerenciar`) recebem e-mail.
- Não é barrada pela trava do último admin. Se nenhum admin sobrar, o aviso vai ao responsável pela conta, e o log registra o caso para o suporte.
- Reativar a pessoa não devolve o acesso.

**Erros:**
- 409 `INVALID_STATUS` (`status`): a ação não vale para a situação atual;
- 409 `PERSON_NOT_ACTIVE`: promover pessoa que não está Ativa;
- 400 `SAME_BOND`, 400 `SAME_ORGANIZATION`;
- 400 `BOND_REQUIREMENTS` ou `GUARDIAN_REQUIRED` (`missingFields`);
- 400 `INVALID_REFERENCE`: motivo ou forma de admissão fora das listas da igreja, ou destino inválido;
- 409 `CPF_CONFLICT`: o CPF já existe na congregação de destino;
- 404 para pessoa fora do escopo.

**Log:** `promover_vinculo`, `inativar`, `transferir`, `desligar`, `registrar_falecimento` e `reativar` (Person, antes e depois). A suspensão gera `suspender_usuario` (User, módulo ACESSO).

### Acompanhamento e linha do tempo (RF-V06, RT-B12)

| Método | Rota | Permissão | Corpo | Resposta |
| --- | --- | --- | --- | --- |
| POST | `/pessoas/:id/acompanhamentos` | `pessoas.acompanhamento.registrar` | `{ date, type: "LIGACAO"\|"VISITA"\|"MENSAGEM"\|"CONVERSA", note? }` | 201 `TimelineFollowUp` |
| GET | `/pessoas/:id/linha-do-tempo` | `pessoas.ver` | — | `{ items: (TimelineEvent \| TimelineFollowUp)[] }`, por `date` e depois `createdAt`, mais recente primeiro |

- `TimelineEvent`: `{ kind: "EVENTO", id, type: "PROMOCAO"|"INATIVACAO"|"TRANSFERENCIA_INTERNA"|"TRANSFERENCIA"|"DESLIGAMENTO"|"FALECIMENTO"|"REATIVACAO", date, organizationId, fromBond, toBond, fromStatus, toStatus, reasonName, note, details, authorName, createdAt }`.
- `TimelineFollowUp`: `{ kind: "ACOMPANHAMENTO", id, type, date, organizationId, note, authorName, createdAt }`.
- O autor é sempre o usuário logado. O autor e a organização do acompanhamento são os da pessoa no momento do registro.
- No MVP não há editar nem apagar. Log: `registrar_acompanhamento`.
- O cadastro não gera evento; o front mostra "Cadastrado em" a partir de `createdAt`.
- `DELETE /pessoas/:id` passa a contar `events` entre os vínculos (`PERSON_HAS_LINKS`).

### Indicadores da jornada (RT-B13, RF-P10)

**`GET /pessoas/indicadores`** (`pessoas.ver`) devolve `{ items: [{ key, count, days }] }`, só contadores, nas organizações que o usuário lê. Todos consideram apenas pessoas Ativas.

| `key` | Critério | Padrão de `days` |
| --- | --- | --- |
| `visitantes_recentes` | Visitante com primeira visita nos últimos N dias | 30 |
| `visitantes_sem_acompanhamento` | Visitante sem acompanhamento nos últimos N dias (ou nunca) | 15 |
| `contato_desatualizado` | `contactUpdatedAt` há mais de N dias | 365 |
| `congregados_discipulado` | Congregado não batizado há mais de N dias no vínculo (`bondSince`) | 180 |

- **Prazos:** vêm de `Organization.peopleSettings` da sede (`{ visitorDays, followUpDays, contactStaleDays, congregationDays }`). Valor ausente ou inválido usa o padrão. Ainda não há tela para editá-los.
- **Lista de cada contador:** **`GET /pessoas?indicador=<key>`**, com o mesmo filtro. Combina com os outros filtros e respeita `pessoas.ver` e o escopo. Chave desconhecida dá 400 `VALIDATION_ERROR`.

### `/acesso/usuarios` (alterado, RF-US04)

- `User` ganha `personStatus` (situação da pessoa ou `null`).
- `POST /acesso/usuarios/:id/reativar` dá 409 `PERSON_NOT_ACTIVE` quando a pessoa do usuário não está Ativa. Reative a pessoa antes.

## Sprint 10 — Auditoria e aba Histórico

Migração `20261013_trilha_auditoria`:
- `AuditLog.personIds` (pessoas afetadas, índice GIN), preenchido também nos registros antigos;
- trigger de somente inclusão (RF-LP03): `UPDATE`, `DELETE` e `TRUNCATE` no `AuditLog` dão erro. A única exceção é apagar `module = LOGIN` com mais de 12 meses (expurgo, RF-LP06).

### Gravação (`runAudited`, `src/lib/audit.ts`)

- **Minimização (RF-LP05):** com antes e depois, grava só os campos que mudaram. Criação guarda o retrato inteiro em `after`; exclusão guarda em `before`.
- **`personIds`:** vem da entrada (`personIds`) ou é deduzido de:
  - alvo `Person`;
  - `personId` no antes/depois;
  - `members[].personId`;
  - a pessoa do `User` ou do `Invite` alvo.
- **Login (RF-LP01)**, módulo `LOGIN`, alvo `User`, organização = sede da igreja do usuário:
  - `login`: na criação da sessão;
  - `login_falhou`: sem autor, `after: { reason }`. Com e-mail sem usuário, fica sem organização e não aparece para nenhuma igreja;
  - `logout`: só no "Sair".
- IP e dispositivo vêm do Fastify (`trustProxy`), repassados ao Better Auth no header interno `x-iezer-client-ip`.

### `AuditEntry`

```
{ id, createdAt, actor: { type: "USUARIO"|"SUPORTE"|"SISTEMA", userId, name },
  organization: { id, name } | null, module, moduleLabel, action, actionLabel,
  targetType, targetTypeLabel, targetId, targetLabel, people: [{ id, name | null }],
  changes: [{ field, label, before, after }], description, ip, userAgent }
```

- **`changes`:** valores já formatados em pt-BR (datas, Sim/Não, enums com rótulo) e sem os campos técnicos. `before: null` = criação; `after: null` = exclusão. Funciona igual para os registros antigos (retrato inteiro) e os novos (minimizados).
- **`targetLabel`:** nome atual do registro ou, se ele foi apagado, o nome guardado no log.
- **`people[].name` null:** a pessoa teve o registro apagado depois.
- **Rótulos:** ficam em `src/modules/acesso/auditoria/rotulos.ts`, o mesmo arquivo que a exportação usa.

### `/acesso/auditoria` (`auditoria.ver`, RF-LP02, RF-LP04)

Escopo:
- com a permissão na sede: todas as organizações da igreja, inclusive congregações desativadas;
- só em congregações: as organizações em que a tem.

Filtros (query), todos opcionais:
- `autor` (userId), `pessoa` (personId), `modulo` (`ModuleKey`), `acao`, `organizacao`;
- `de`/`ate` (`"AAAA-MM-DD"`, dia civil de Brasília; `de > ate` dá 400 `VALIDATION_ERROR`);
- `suporte=true` (autor Suporte iEzer).

| Método | Rota | Resposta |
| --- | --- | --- |
| GET | `/acesso/auditoria` | `{ items: AuditEntry[], total, page, pageSize }`, mais recente primeiro. `page`, `pageSize` (padrão 25, máx. 100) |
| GET | `/acesso/auditoria/filtros` | `{ organizations: [{ id, name, type, isActive }], modules: [{ value, label }], actions: [{ value, label, modules }], authors: [{ id, name, email }] }`, só com o que existe no log do escopo |
| GET | `/acesso/auditoria/exportar` | CSV (`;`, UTF-8 com BOM) com os mesmos filtros, até 10.000 linhas. Headers `X-Export-Rows` e `X-Export-Truncated`. Grava `exportar_auditoria` (alvo `AuditLog`, `after: { filters, rows, truncated }`) |

Na planilha, célula que começa com `= + - @` recebe apóstrofo (contra injeção de fórmula).

### `GET /pessoas/:id/historico` (`pessoas.historico.ver`, aba Histórico)

- Responde `{ items: AuditEntry[], total, page, pageSize }`, com `page` e `pageSize` (padrão 20).
- Traz só o módulo PESSOAS sobre a pessoa, em todas as organizações da igreja.
- Pessoa fora do escopo de leitura dá 404.
- O histórico completo (acesso, financeiro, login) fica na Auditoria, com `?pessoa=`.

## Sprint 11 — Importação pela planilha modelo

Todas as rotas exigem `pessoas.importar` e uma organização concreta no seletor ("todas" dá 400 `ORGANIZATION_REQUIRED`). Código em `src/modules/pessoas/importacao/` (`planilha.ts` gera e lê o `.xlsx` com `exceljs`).

### `GET /pessoas/importacao/modelo` (RF-I01 a RF-I05)

`.xlsx` com `Content-Disposition: attachment; filename="modelo-pessoas-<organizacao>.xlsx"`. Abas:
- **Instruções**, com o aviso da guarda das fichas em papel.
- **Pessoas:** cabeçalho, linha de exemplo ("Maria Exemplo da Silva", ignorada na leitura) e 34 colunas em formato texto (`@`), aplicado na coluna e em cada célula até a linha 2.002 (Numbers, Google Planilhas e LibreOffice ignoram o formato da coluna). Validações até a linha 2.002: listas (vínculo, sexo, estado civil, tipo de documento, S/N, UF, formas de admissão ativas da igreja) e datas `dd/mm/aaaa`.
- **Listas** (oculta), fonte das validações.
- **`_meta`** (`veryHidden`): `versao` (`pessoas-1`), `organizacao` (id) e `gerado_em`. O mesmo código fica visível no fim das Instruções ("Código do modelo: pessoas-1 · <id>"), porque o Numbers e o Google Planilhas podem descartar as abas ocultas ao exportar. Na leitura, o cabeçalho é procurado nas 5 primeiras linhas da aba Pessoas ou, se ela foi renomeada, da primeira aba que tiver "Nome completo".

### `POST /pessoas/importacao/previa` (RF-I06, RT-B10, etapa 1)

Body `{ arquivo: <base64 do .xlsx>, nomeArquivo? }`, até 5 MB e 2.000 linhas. **Não grava nada.**

Recusa o arquivo inteiro (400):
- `NUMBERS_FILE`: arquivo do Numbers (`.numbers`); a mensagem explica como exportar para Excel.
- `TEMPLATE_INVALID`: arquivo ilegível, sem o código do modelo, sem o cabeçalho ou sem alguma coluna.
- `TEMPLATE_OUTDATED`: versão do modelo diferente (`templateVersion` no corpo).
- `TEMPLATE_ORGANIZATION`: modelo de outra organização (o nome aparece só se for da mesma igreja).
- `EMPTY_FILE` e `TOO_MANY_ROWS`.

Resposta:
```
{ organizationId, organizationName, templateVersion,
  declaration: { text, version },
  totals: { total, novos, duplicados, repetidas, recusadas },
  rows: [{ line, name, bond | null, birthDate | null,
           action: "criar" | "duplicado" | "repetida" | "recusada",
           errors: string[], warnings: string[], repeatedLine | null,
           guardian: { personId | null, name, line | null } | null,
           duplicate: { personId, name, bond, status, birthDate, organizationName,
                        reasons: ("CPF"|"NOME_NASCIMENTO"|"NOME_CELULAR"|"NOME_EMAIL")[] } | null }] }
```

Regras por linha:
- **Recusada:** nome ou vínculo ausentes; formato inválido (data, CPF com dígito verificador, telefone, email, CEP, UF); valor fora das listas; data no futuro.
- **Responsável (RF-P09):** menor de 18 anos ou Membro em formação precisa de responsável maior de idade, pelo "CPF do responsável" ou pelo "Nome do responsável". A busca é primeiro na planilha e depois na base. Responsável da base que já está numa família precisa ser Responsável ou Cônjuge nela. Menor também precisa de "Consentimento coletado" = S. Faltou algo, a linha é recusada.
- **Repetida:** mesmo CPF, ou mesmo nome e nascimento, de uma linha anterior (só a primeira entra). Também é repetida a segunda linha que casa com o mesmo cadastro existente.
- **Duplicado contra a base** (organização ativa): mesmo CPF, ou nome parecido com mesmo nascimento, celular ou email. Email ou celular sozinho não conta. CPFs diferentes nunca são duplicados.
- **Avisos:**
  - vínculo sem o mínimo entra como cadastro incompleto;
  - vínculo da planilha diferente do cadastro (não muda);
  - cadastro existente não Ativo;
  - responsável informado para adulto é ignorado.

### `POST /pessoas/importacao/confirmar` (RF-I07, RF-I08, RT-B10, etapa 2)

Body `{ arquivo, nomeArquivo?, decisoes: { "<linha>": "pular" | "atualizar" }, declaracao: true }`. Sem `declaracao: true` dá 400 `VALIDATION_ERROR`.

Comportamento:
- Lê e confere tudo de novo; o servidor não guarda a prévia. Duplicado sem decisão é pulado.
- Grava as linhas novas e as atualizações numa transação só (`runAudited` com timeout de 120 s, escritas em lote). Recusadas e repetidas ficam de fora.
- **Novas:** situação Ativo, com `bondSince` pelo vínculo. Criança sem endereço herda o do responsável e entra como Filho na família dele, criada se ele ainda não tiver. Consentimento S grava `PersonConsent` (CADASTRO, `PLANILHA`, data da planilha ou hoje), dado pelo responsável quando a pessoa é menor.
- **Atualizar:** grava só os campos preenchidos na planilha, sem apagar nada. Vínculo, situação e congregação não mudam. Ganha consentimento e família do responsável só se ainda não tiver.

Erros:
- 400 `NOTHING_TO_IMPORT`: nenhuma linha para gravar.
- 409 `IMPORT_CONFLICT`: CPF ou família usados por outra pessoa durante a importação.

Resposta (relatório, RF-I08):
```
{ importId, fileName,
  totals: { criadas, atualizadas, puladas, recusadas },
  rows: [{ line, name, result: "criada"|"atualizada"|"pulada"|"recusada", personId | null, messages: string[] }] }
```

O relatório não fica salvo; o front gera o CSV. Auditoria, com a descrição "Importação da planilha":
- `criar`/`editar` por pessoa;
- `criar` Family / `adicionar_membro`;
- `registrar_consentimento`;
- um `importar` (alvo `PersonImport`, `targetId = importId`) com `fileName`, `templateVersion`, os totais, `refusedLines`, `declaration`, `declarationVersion` e os `personIds` de todas as pessoas criadas e atualizadas (RF-P08).

## Sprint 12 — Google, 2FA, alertas e Minha conta

### Erros novos nas rotas protegidas

| Status | `code` | Quando |
| --- | --- | --- |
| 403 | `TWO_FACTOR_REQUIRED` | Sessão aberta pelo Google de quem tem 2FA: vale só depois do código. Todas as rotas `/api/*` protegidas, inclusive `/me`. O front mostra a verificação |
| 403 | `TWO_FACTOR_SETUP_REQUIRED` | Quem tem permissão protegida numa organização ativa e ainda não ligou o 2FA (RF-CV07). Só `/api/me/*` responde. O front mostra a configuração obrigatória |

O login pelo Google **não** dispensa o 2FA (A3 revisto na Sprint 12).

### `/api/auth/*` (alterado)

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/sign-in/email` | `{ email, password }` | Sem 2FA: igual. Com 2FA: 200 `{ twoFactorRedirect: true, twoFactorMethods: ("totp"\|"otp")[] }` + cookie `two_factor` (10 min), sem sessão |
| POST | `/sign-in/social` | `{ provider: "google", callbackURL, errorCallbackURL }` | 200 `{ url, redirect: true }`. Volta em `callbackURL` com sessão, ou em `errorCallbackURL?error=CODIGO` |
| POST | `/two-factor/send-otp` | — | Envia o código de 6 dígitos por e-mail (10 min) |
| POST | `/two-factor/verify-totp` · `/verify-otp` · `/verify-backup-code` | `{ code }` | 200 `{ token, user }` + cookie da sessão. Também libera a sessão pendente do Google |
| POST | `/two-factor/enable` | `{ password?, method: "totp"\|"otp" }` | `totp`: `{ totpURI, backupCodes[10] }`, e liga no primeiro `verify-totp`. `otp`: liga na hora |
| POST | `/two-factor/disable` | `{ password? }` | 403 `TWO_FACTOR_MANDATORY` para quem tem protegida |
| POST | `/two-factor/generate-backup-codes` | `{ password? }` | `{ backupCodes }` (só com app configurado) |

- **Senha nas rotas de 2FA:** é exigida só de quem tem senha; quem só usa Google não informa.
- **Erros do 2FA** (em inglês; o front traduz): `INVALID_CODE`, `INVALID_BACKUP_CODE`, `OTP_HAS_EXPIRED`, `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`, 429 `ACCOUNT_TEMPORARILY_LOCKED` (5 erros, 15 min), `INVALID_TWO_FACTOR_COOKIE`, `TOTP_NOT_ENABLED`.
- **Erros do Google** em `?error=`:
  - `INVITE_REQUIRED`: sem usuário nem convite válido, ou o Google não confirmou o e-mail (RF-LG02);
  - `USER_INACTIVE`;
  - `account_not_linked`;
  - `access_denied`: a pessoa cancelou.
- **Fechadas ao navegador (404 `NOT_FOUND`):** `/change-password`, `/set-password`, `/change-email`, `/update-user`, `/delete-user`, `/link-social`, `/unlink-account`, `/list-accounts`, `/update-session`, `/list-sessions`, `/revoke-session(s)`, `/revoke-other-sessions`. Use `/api/me/*`.
- **Bloqueio por e-mail (A6):** depois de 5 erros seguidos, `/sign-in/email` dá 429 `LOGIN_LOCKED` com a mensagem em português. São 15 min, que dobram a cada nova série de 5, até 24 h. Vale também para e-mail sem usuário. O usuário recebe aviso por e-mail. Login certo ou senha redefinida zeram a contagem.
- **Primeiro acesso pelo Google com convite:**
  - o usuário nasce com a pessoa do convite, e o convite é consumido ao abrir a sessão (auditoria `aceitar_convite` com `method: "google"`);
  - os termos são aceitos depois, em `POST /me/termos`. O front aceita sozinho quando a pessoa já marcou os termos na página do convite.

### `GET /api/me` (alterado)

Acrescenta:
- `user.twoFactorEnabled`;
- `twoFactor: { enabled, required }`;
- `person.preferredName` (RF-MC01).

### Minha conta (`/api/me/*`, só sessão; responde também a quem precisa configurar o 2FA)

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/me/seguranca` | — | `{ twoFactorEnabled, twoFactorRequired, totpEnabled, hasPassword, hasGoogle }` |
| POST | `/me/senha` | `{ currentPassword?, newPassword }` | `{ hasPassword: true }`. Com senha: troca, encerra as outras sessões e renova o cookie. Sem senha (só Google): define. Erros: 400 `CURRENT_PASSWORD_REQUIRED`, `INVALID_PASSWORD` (atual errada), `WEAK_PASSWORD`, `PASSWORD_COMPROMISED` |
| GET | `/me/sessoes` | — | `{ items: [{ id, device, ipAddress, location, pendingTwoFactor, createdAt, lastUsedAt, current }] }` (RF-MC04; `lastUsedAt` muda uma vez por dia) |
| DELETE | `/me/sessoes/:id` | — | `{ sessionsEnded }`. 400 `CURRENT_SESSION` (use Sair), 404 `SESSION_NOT_FOUND` |
| POST | `/me/sessoes/encerrar-outras` | — | `{ sessionsEnded }` |
| GET | `/me/acessos` | — | `{ items: [{ organizationId, organizationName, type, profiles[], permissions: [{ module, moduleName, permissions[] }] }] }` (RF-MC05) |
| POST | `/me/email` | `{ email }` | `{ email, emailSent }`. Link de 1 h no e-mail novo (RF-MC06). Erros: 400 `SAME_EMAIL`, 409 `EMAIL_IN_USE`, 429 `RATE_LIMITED` (3 por hora) |

### `POST /api/email/confirmar/:token` (público, limite por IP)

- Confirma a troca de e-mail e devolve `{ email }`.
- Troca o login e também o e-mail da pessoa, quando era o mesmo.
- Encerra todas as sessões e avisa o e-mail antigo.
- Erro: 404 `EMAIL_CHANGE_INVALID` (link inválido, expirado ou já usado).

### `POST /api/acesso/usuarios/:id/2fa/redefinir` (`acesso.usuarios.gerenciar`, RF-RS05)

- Apaga o app e os códigos de recuperação, desliga o 2FA, encerra as sessões e avisa por e-mail. Devolve o usuário.
- Erros:
  - 400 `OWN_ACCESS`: tentar redefinir o próprio 2FA;
  - 400 `TWO_FACTOR_DISABLED`: o usuário não usa 2FA;
  - 403: usuário com acesso fora do alcance de quem redefine.

### Alertas por e-mail e auditoria

- **Alertas:**
  - login em dispositivo novo (navegador e sistema fora dos logins dos últimos 90 dias; o primeiro login não avisa);
  - senha trocada, definida ou redefinida;
  - 2FA ativado, desativado ou redefinido;
  - e-mail trocado (aviso ao antigo);
  - login bloqueado;
  - permissão protegida concedida (desde a Sprint 8).
- **Ações novas no log:** `login_bloqueado`, `trocar_senha`, `definir_senha`, `ativar_2fa`, `desativar_2fa`, `redefinir_2fa`, `encerrar_sessao`, `encerrar_outras_sessoes`, `trocar_email`.
- **Quando conta como login:** com 2FA, o `login` é gravado depois do código. A sessão recriada ao ligar o 2FA não conta.

## Sprint 13 — Acesso do suporte

O atendente do suporte é um `User` nominal com `isSupportAgent` (script `npm run suporte:agente -- <email> [remover]`), sem atribuições e com 2FA obrigatório (RF-SP06). Ele entra pelo mesmo login. Nas rotas de dados, alcança só as igrejas com um `SupportGrant` ativo, conferido a cada requisição (RT-AB11).

### `SupportGrant`

```json
{
  "id": "cuid", "churchId": "cuid", "churchName": "string",
  "origin": "PEDIDO_SUPORTE | AUTORIZACAO_ADMIN | EMERGENCIA",
  "status": "PENDENTE | AGUARDANDO_SEGUNDA_APROVACAO | ATIVO | EXPIRADO | RECUSADO | REVOGADO | ENCERRADO | CANCELADO",
  "emergencyKind": "INCIDENTE | ORDEM_JUDICIAL | IGREJA_SEM_ADMIN | null",
  "ticket": "string|null", "reason": "string",
  "scope": ["pessoas", "financeiro", "acesso", "configuracoes"], "scopeNames": ["Pessoas"],
  "canWrite": false, "writeJustification": "string|null", "durationHours": 72,
  "requestedAt": "ISO", "requestedById": "cuid|null", "requestedByName": "Nome (Suporte iEzer)|null",
  "approvedAt": "ISO|null", "approvedByName": "string|null",
  "startsAt": "ISO|null", "expiresAt": "ISO|null",
  "closedAt": "ISO|null", "closedByName": "string|null", "closeReason": "string|null"
}
```

- **Status:**
  - `EXPIRADO` é calculado: está `ATIVO` no banco, mas o prazo venceu (RF-SP08, sem job);
  - nos nomes, quem é atendente aparece com o sufixo "(Suporte iEzer)".
- **Corpo comum de pedido, autorização e emergência:** `{ ticket?, reason (5–500), scope: string[] (1+), canWrite = false, writeJustification?, durationHours }`. Com `canWrite`, `writeJustification` é obrigatória (RF-SP02).
- **Prazos:** padrão de 72 h e máximo de 168 h; na emergência, até 24 h (padrão 24).

### Atendente nas rotas de dados

- **Permissões do atendente:** as chaves do catálogo nos módulos do `scope`, menos `pessoas.notas_pastorais.*` e `acesso.suporte.autorizar` (RF-SP05).
- **`GET /me`:** `user.isSupportAgent`, e cada organização traz `support: { grantId, canWrite, expiresAt }`.
- **Log das leituras:** cada GET do atendente grava `suporte_ler` antes da resposta, com o alvo `Rota` (RF-SP07). `description` traz o nome da tela (ex.: "Perfil da pessoa"; sem nome, `GET <url>`), e `after.url` só aparece quando há busca ou filtro. Na Auditoria, `targetLabel` mostra a pessoa aberta ou a tela. Elas não entram na aba Histórico (`GET /pessoas/:id/historico` exclui as ações de leitura, `READ_ACTIONS`): quem acessou a pessoa fica só na Auditoria, filtrada por pessoa (RF-LP04). As escritas saem com `actorType: SUPORTE` pelo `runAudited`.
- **Rota fechada ao suporte:** use `{ config: { denySupport: true } }`. É para o endpoint de notas pastorais, quando existir (F2).

| Status | `code` | Quando |
| --- | --- | --- |
| 403 | `SUPPORT_NO_GRANT` | Atendente sem nenhum acesso ativo (vencido, revogado ou nunca autorizado). O front recarrega o `/me` |
| 403 | `SUPPORT_READ_ONLY` | Método diferente de GET num acesso somente leitura |
| 403 | `SUPPORT_FORBIDDEN` | Escrita em `/acesso/*` ou `/organizacao/*`, mesmo com `canWrite`, ou rota com `denySupport` |

### `/acesso/suporte` (Configurações › Acesso do suporte)

Leitura: qualquer de `acesso.suporte.autorizar`, `acesso.perfis.gerenciar` ou `auditoria.ver`. Escrita: `acesso.suporte.autorizar` na sede.

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/acesso/suporte` | — | `{ active: SupportGrant\|null, pending: SupportGrant[], history: SupportGrant[] }`. Emergência aguardando a segunda aprovação não aparece |
| POST | `/acesso/suporte` | corpo comum | 201 `SupportGrant` ativo na hora (RF-SP01, segundo caminho). 409 `SUPPORT_ALREADY_ACTIVE` |
| POST | `/acesso/suporte/:id/aprovar` | `{ durationHours? }` | `SupportGrant`. O prazo começa agora e só pode ser encurtado. 409 `INVALID_SUPPORT_STATUS` ou `SUPPORT_ALREADY_ACTIVE` |
| POST | `/acesso/suporte/:id/recusar` | `{ reason? }` | `SupportGrant` recusado |
| POST | `/acesso/suporte/:id/revogar` | — | `SupportGrant` revogado, que vale na hora. 403 `SUPPORT_EMERGENCY`: a emergência só o iEzer encerra |

- **Avisos por e-mail:** o pedido vai para quem tem `acesso.suporte.autorizar`. A autorização ou aprovação vai para todos os admins, isto é, quem tem `acesso.suporte.autorizar` ou `acesso.perfis.gerenciar` na sede (RF-SP03).

### Back-office (`/api/suporte/*`, só atendente)

Fora da organização ativa. Desde a Sprint 15, só membro da equipe com o papel Suporte (ou Administrador iEzer); os outros recebem 403 `TEAM_ROLE_FORBIDDEN`. Tudo vai para o `AuditLog` com `actorType: SUPORTE`, na organização da igreja.

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/suporte/igrejas?busca=` | — | `{ items: [{ id, name, slug, cnpj, congregations, accountOwner: { name, email, phone }\|null, admins, activeGrant: { id, expiresAt, canWrite, origin }\|null }] }` (até 50) |
| GET | `/suporte/acessos?igreja=` | — | `{ items: SupportGrant[] }` (até 200, mais recentes primeiro) |
| POST | `/suporte/pedidos` | corpo comum + `churchId`, `ticket` obrigatório | 201 `SupportGrant` pendente + `notified` (quantos podem aprovar) (RF-SP01) |
| POST | `/suporte/emergencias` | corpo comum + `churchId`, `kind` | 201 `SupportGrant` em `AGUARDANDO_SEGUNDA_APROVACAO` (RF-SP09) |
| POST | `/suporte/emergencias/:id/aprovar` | — | `SupportGrant` ativo. 403 `SUPPORT_SAME_APPROVER` se for quem pediu. Avisa na hora o responsável pela conta e os admins |
| POST | `/suporte/acessos/:id/cancelar` | `{ reason? }` | Pedido ou emergência ainda não decididos |
| POST | `/suporte/acessos/:id/encerrar` | `{ reason? }` | Ativo, encerrado antes do prazo (inclusive a emergência) |
| POST | `/suporte/igrejas/:churchId/recuperar-admin` | `{ name, email, mobilePhone?, verification (10+) }` | `{ adminName, viaInvite, link, emailSent }` (RF-SP10) |

- **Recuperar admin:**
  - usuário ativo da igreja com esse e-mail recebe o perfil Pastor na sede (409 `ALREADY_ADMIN` se já tem);
  - sem usuário, a pessoa é achada pelo e-mail ou criada na sede (Membro, Ativo) e recebe o convite de Pastor, ou o pendente é reenviado;
  - registra `suporte_recuperar_admin` com a verificação e avisa os admins atuais e o responsável pela conta;
  - erros: 409 `USER_OTHER_CHURCH` (usuário de outra igreja ou atendente), 409 `USER_NOT_ACTIVE`, 409 `PASTOR_PROFILE_MISSING`.
- **Ações novas no log:** `suporte_pedir`, `suporte_autorizar`, `suporte_aprovar`, `suporte_recusar`, `suporte_revogar`, `suporte_encerrar`, `suporte_cancelar`, `suporte_emergencia_pedir`, `suporte_emergencia_aprovar`, `suporte_recuperar_admin`, `suporte_ler` (alvos `SupportGrant`, `Rota`, `User` ou `Person`), e `marcar_atendente_suporte` / `desmarcar_atendente_suporte` (script, ator Sistema).

## Sprint 15 — Equipe iEzer e sessão da equipe

Conta da equipe = `User` sem pessoa e sem atribuições, com `TeamMember` (`roles`: `ADMINISTRADOR`, `SUPORTE`, `IMPLANTACAO`; o Administrador faz tudo). O status é o do `User` (`ATIVO`/`DESATIVADO`). `User.isSupportAgent` saiu do banco: o atendente agora é membro com o papel Suporte. `GET /api/me` continua devolvendo `user.isSupportAgent`, calculado a partir do papel.

### Regras da sessão da equipe (todas as rotas protegidas)

| Status | `code` | Quando |
| --- | --- | --- |
| 401 | `SESSION_IDLE` | Sessão da equipe sem uso há mais de 12h (`Session.lastActiveAt`, gravado a cada 5 min). A sessão é apagada |
| 403 | `TWO_FACTOR_SETUP_REQUIRED` | Conta da equipe sem app autenticador (TOTP verificado). Só `/api/me/*` e `/api/admin/me*` respondem |
| 403 | `TEAM_TOTP_ONLY` | Conta da equipe em `/api/auth/two-factor/send-otp`, `/verify-otp` ou `/enable` com `method: "otp"` |
| 403 | `TEAM_GOOGLE_FORBIDDEN` | Conta da equipe no login pelo Google (volta em `?error=`) |
| 403 | `TEAM_EMAIL_CHANGE_FORBIDDEN` | Conta da equipe em `POST /api/me/email` |

- **Login da equipe:** e-mail a todos os Administradores iEzer (nome, data e hora, navegador, local, IP; RF-BO55), no lugar do alerta de dispositivo novo. No bloqueio após 5 erros, os Administradores também recebem aviso. No log, `actorType: SUPORTE`, organização nula.
- **`/sign-in/email`** ainda lista `twoFactorMethods: ["totp", "otp"]` para a equipe; o app admin oferece só o app autenticador.
- **Contas exclusivas:** convite ou troca de e-mail de igreja para um e-mail da equipe (membro ou convite da equipe válido) dá 409 `TEAM_EMAIL` (`/acesso/convites`, `/acesso/usuarios`); em `/me/email`, 409 `EMAIL_IN_USE`.

### Convite da equipe (público, limite por IP)

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/api/admin/convites/:token` | — | `{ name, email, roles, inviterName, expiresAt, termsVersion }`. 404 `TEAM_INVITE_INVALID` |
| POST | `/api/admin/convites/:token/aceitar` | `{ password, acceptTerms: true }` | `{ signedIn }` + cookie da sessão. Cria o `User` sem pessoa, a senha e o `TeamMember` com o termo aceito. Erros: 400 `WEAK_PASSWORD`, `PASSWORD_COMPROMISED`, `VALIDATION_ERROR`; 404 `TEAM_INVITE_INVALID`; 409 `EMAIL_IN_USE`, `CHURCH_USER_EMAIL` |

Depois do aceite, a sessão só configura o app autenticador: `POST /api/auth/two-factor/enable { password }` → `{ totpURI, backupCodes[10] }`, depois `POST /api/auth/two-factor/verify-totp { code }`.

### `/api/admin/*` (só conta da equipe)

Conta de igreja: 403 `TEAM_ACCOUNT_REQUIRED` ("Esta conta não tem acesso ao back-office do iEzer."). Sem o termo da versão atual: 403 `TEAM_TERMS_REQUIRED`, exceto em `/admin/me*`. Papel insuficiente: 403 `TEAM_ROLE_FORBIDDEN`.

| Método | Rota | Papel | Corpo | Resposta |
| --- | --- | --- | --- | --- |
| GET | `/admin/me` | qualquer | — | `{ user: { id, name, email, lastLoginAt }, memberId, roles, terms: { version, accepted }, twoFactor: { enabled, required: true } }` |
| POST | `/admin/me/termo` | qualquer | — | `{ version, accepted: true }` |
| GET | `/admin/equipe` | Administrador | — | `{ items: TeamItem[] }`: membros e convites pendentes (inclusive vencidos), por nome |
| POST | `/admin/equipe/convites` | Administrador | `{ name, email, roles[] }` | 201 `{ invite: TeamItem, link, emailSent }` (72h, uso único). 409 `TEAM_MEMBER_EXISTS`, `CHURCH_USER_EMAIL`, `TEAM_INVITE_PENDING` |
| POST | `/admin/equipe/convites/:id/reenviar` | Administrador | `{ sendEmail? }` | `{ invite, link, emailSent }`. Novo token e mais 72h. 409 `TEAM_INVITE_NOT_PENDING` |
| POST | `/admin/equipe/convites/:id/cancelar` | Administrador | — | `TeamItem` com `status: "CANCELADO"` |
| PATCH | `/admin/equipe/:id/papeis` | Administrador | `{ roles[] }` | `TeamItem`. 409 `TEAM_SELF_CHANGE`, `TEAM_LAST_ADMIN` |
| POST | `/admin/equipe/:id/desativar` | Administrador | — | `TeamItem`. Derruba as sessões. 409 `TEAM_SELF_CHANGE`, `TEAM_LAST_ADMIN`, `TEAM_ALREADY_INACTIVE` |
| POST | `/admin/equipe/:id/reativar` | Administrador | — | `TeamItem`. 409 `TEAM_ALREADY_ACTIVE` |
| POST | `/admin/equipe/:id/autenticador/redefinir` | Administrador | — | `TeamItem`. Apaga o app autenticador e os códigos, derruba as sessões e avisa o membro por e-mail (RF-BO09) |

`TeamItem`: `{ id, kind: "MEMBRO"|"CONVITE", userId, name, email, roles, status: "CONVIDADO"|"ATIVO"|"DESATIVADO"|"CANCELADO", twoFactorEnabled, lastLoginAt, invitedByName, inviteExpiresAt, createdAt }`. O `id` é o do membro ou o do convite, conforme o `kind`. `twoFactorEnabled` só conta o app autenticador.

- **Auditoria:** organização nula, módulo `BACKOFFICE`, `actorType: SUPORTE`. Ações: `convidar_equipe`, `reenviar_convite_equipe`, `cancelar_convite_equipe`, `aceitar_convite_equipe`, `aceitar_termo_equipe`, `alterar_papeis_equipe`, `desativar_equipe`, `reativar_equipe`, `redefinir_autenticador_equipe`, `promover_administrador_equipe` (script). Alvos `TeamMember` e `TeamInvite`.
- **Bootstrap:** `npm run suporte:agente -- <email> "<nome>"` só roda sem Administrador iEzer ativo. Membro da equipe existente ganha o papel; e-mail novo recebe convite de Administrador (link no log).

## Sprint 16 — App admin

O app admin (`iezer-front`, pasta `admin/`, porta 5174 em dev) usa as rotas da Sprint 15 e o Minha conta de `/api/me/*`. A única rota nova é esta.

### `POST /api/me/2fa/reconfigurar` (só sessão, limite por IP; RF-BO05)

| Corpo | Resposta |
| --- | --- |
| `{ password }` | `{ reconfiguring: true, sessionsEnded }` |

- Serve para trocar o app autenticador (ex.: celular novo). Confere a senha, apaga o app e os códigos de recuperação, desliga o 2FA e encerra as **outras** sessões. A atual fica.
- Depois, o front segue como na primeira configuração: `POST /api/auth/two-factor/enable { password, method: "totp" }` e `verify-totp`. Se a pessoa parar no meio, quem tem o 2FA obrigatório recebe 403 `TWO_FACTOR_SETUP_REQUIRED` e volta à configuração.
- Erros:
  - 400 `INVALID_PASSWORD` (campo `password`);
  - 400 `TOTP_NOT_ENABLED`: a conta não tem app autenticador;
  - 400 `VALIDATION_ERROR`.
- Log `reconfigurar_2fa` (autor `SUPORTE` para a equipe) e alerta por e-mail "Verificação em duas etapas reconfigurada". O `ativar_2fa` da nova configuração é gravado como sempre.
- Vale para qualquer usuário com o app. Por enquanto, só o app admin usa.
- `accountContext` de `/api/me/*` grava como `SUPORTE` quando a sessão é da equipe (antes, `USUARIO`).

## Sprint 17 — Igrejas no back-office

`Organization` ganhou `status` (`IMPLANTACAO`, `ATIVA`, `SUSPENSA`, `ENCERRADA`; só vale na sede), `statusChangedAt` e `statusReason` (RT-BB04). A igreja nova nasce em `IMPLANTACAO`; as anteriores viraram `ATIVA`. CNPJ único entre as sedes (índice parcial). Nenhuma rota abaixo devolve dados de pessoa além do que a B8 permite.

### `/api/admin/igrejas` (só conta da equipe)

Ver e reenviar convite: qualquer papel. Criar e editar: Administrador ou Implantação (403 `TEAM_ROLE_FORBIDDEN` para o Suporte). Igreja inexistente: 404 "Igreja não encontrada.".

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/admin/igrejas?busca=&situacao=` | — | `{ items: ChurchListItem[] }`, por nome. `busca` procura no nome e no CNPJ (com ou sem máscara) |
| POST | `/admin/igrejas` | `CreateChurch` | 201 `{ church: { id, name, status }, invite: { email, expiresAt, emailSent } }` |
| GET | `/admin/igrejas/:id` | — | `ChurchDetail` |
| PATCH | `/admin/igrejas/:id` | `{ name?, cnpj? }` | igreja no formato de `GET /organizacao`. 409 `CHURCH_CNPJ_TAKEN`, `ORGANIZATION_NAME_TAKEN` |
| POST | `/admin/igrejas/:id/congregacoes` | `{ name }` | 201 congregação |
| PATCH | `/admin/igrejas/:id/congregacoes/:congregationId` | `{ name?, isActive? }` | congregação. Sem DELETE |
| PUT | `/admin/igrejas/:id/contatos/responsavel` | `{ jobTitle?, email, phone? }` | contato. O nome não muda aqui: a troca do responsável exige documento (Sprint 18). 409 `ACCOUNT_OWNER_MISSING` |
| PUT | `/admin/igrejas/:id/contatos/encarregado-lgpd` | `{ name, jobTitle?, email, phone? }` | contato |
| DELETE | `/admin/igrejas/:id/contatos/encarregado-lgpd` | — | 204 |
| GET | `/admin/igrejas/:id/usuarios` | — | `{ items: ChurchUserItem[] }`: convites pendentes (inclusive vencidos) e depois usuários, por nome |
| POST | `/admin/igrejas/:id/convites/:inviteId/reenviar` | `{ reason, ticket? }` | `{ email, expiresAt, emailSent, ownerNotified }`. 409 `NOT_ADMIN_INVITE`, `INVITE_NOT_PENDING`; 404 "Convite não encontrado." |

- `CreateChurch`: `{ name, cnpj, congregations?: string[], accountOwner: { name, jobTitle?, email, phone }, lgpdOfficer?: { name, jobTitle?, email, phone? }, admin: { name, email } }`. O CNPJ é obrigatório (numérico ou alfanumérico) e o telefone do responsável também.
- A criação roda numa transação só (`createChurch` em `src/modules/admin/igrejas/criacao.ts`): sede em Implantação, congregações, contatos, perfis de fábrica, listas, a Pessoa do admin na sede e o convite com o perfil Pastor. O e-mail do convite sai depois do commit.
- Erros da criação: 409 `CHURCH_CNPJ_TAKEN` (`field: "cnpj"`, `churchId` da outra igreja, para o link); 409 `EMAIL_IN_OTHER_CHURCH`, `USER_EXISTS`, `INVITE_PENDING`, `TEAM_EMAIL` (e-mail do admin); 400 `ORGANIZATION_NAME_TAKEN` (`field: "congregations"`, nome repetido entre sede e congregações); 400 `VALIDATION_ERROR` com `issues[].path` (ex.: `accountOwner.phone`).
- **O link do convite não volta para a equipe** (B8): só o convidado entra. O link sai só no e-mail (em dev, no log do back).
- O convite feito pela equipe aparece para a igreja (lista de convites, página pública e e-mail) como feito pela "Equipe iEzer", não pelo nome de quem atendeu.
- `ChurchListItem`: `{ id, name, cnpj, status, statusChangedAt, congregations (ativas), accountOwner: { name, email } | null, activeUsers, lastUsedAt, createdAt }`. `lastUsedAt` é o último login entre os usuários da igreja.
- `ChurchDetail`: `{ id, name, cnpj, status, statusChangedAt, statusReason, createdAt, accountOwner, lgpdOfficer, congregations: [{ id, name, isActive, createdAt }], counters: { people, activeUsers, lastUsedAt } }`.
- `ChurchUserItem`: `{ kind: "USUARIO"|"CONVITE", id, name, email, status: "ATIVO"|"DESATIVADO"|"SUSPENSO"|"CONVIDADO"|"CONVITE_EXPIRADO", lastLoginAt, organizations: [{ organizationId, organizationName, profiles[] }], inviteExpiresAt, isAdminInvite }`. Sem id de Pessoa. Convite de admin = algum perfil com `acesso.perfis.gerenciar`.
- **Reenviar convite de admin** (RF-BO29, RF-BO32): `reason` com 5 a 500 caracteres, `ticket` até 60. Gera um link novo (o anterior deixa de valer) e mais 72h, manda o e-mail ao convidado e avisa o responsável pela conta ("Ação do suporte do iEzer na conta da sua igreja", com motivo e chamado).
- **Auditoria:** tudo na organização da igreja com `actorType: SUPORTE` ("Suporte iEzer" na Auditoria da igreja). Ações: `criar_igreja`, `criar_convite`, `editar_sede`, `criar_congregacao`, `editar_congregacao`, `desativar_congregacao`, `reativar_congregacao`, `editar_responsavel_conta` (nova), `editar_encarregado_lgpd`, `remover_encarregado_lgpd`, `suporte_reenviar_convite` (nova; `description` com motivo e chamado).

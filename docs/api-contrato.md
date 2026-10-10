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

### `/acesso/usuarios` (lista básica; o resto fica na Sprint 8)

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

- O responsável pela conta é só leitura (muda pelo script e pelo iEzer).
- Erros: 409 `ORGANIZATION_NAME_TAKEN` (`field: "name"`, nome repetido na igreja), 404 para congregação inexistente.

### Script de onboarding (RF-OB01, RF-OB02)

`npm run igreja:criar -- <arquivo.json>`: o formato está no cabeçalho de `scripts/create-church.ts`.
- Cria a sede, ou completa uma existente com `sedeId`, além de congregações, contatos, perfis de fábrica, listas da igreja e a Pessoa do primeiro admin.
- Convida o primeiro admin como Pastor na sede e imprime o link.
- É idempotente.

### E-mail

`src/lib/mailer.ts` envia pelo Resend (`RESEND_API_KEY`, `EMAIL_FROM`) com remetente "Nome da Igreja via iEzer". Sem chave, o e-mail vai para o log: em dev com o link, em produção só destinatário e assunto.

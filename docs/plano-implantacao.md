# Plano de implantação — Acesso e Pessoas (MVP)

Requisitos: `docs/prd/acesso.md` e `docs/prd/pessoas.md`, citados por ID (ex.: RF-CV03, RT-AB02).
Repositórios: `iezer-back` (este plano mora aqui) e `iezer-front` (caminho informado no prompt de abertura).
Ambiente: Claude Code no Cursor, aberto no `iezer-back`.

## Regras das sprints (para o Claude Code)

**Uma sprint = uma janela de chat.** Abra uma janela nova para cada sprint. A continuidade entre janelas é este arquivo e o `docs/api-contrato.md`, não a conversa.

1. **Leia só o necessário:** `CLAUDE.md`, a seção da sprint atual e as duas últimas entradas do Registro. Nos PRDs, busque os IDs citados na sprint (`grep`) em vez de ler o arquivo inteiro. Nas sprints com front, leia também o `CLAUDE.md` do front e o `docs/api-contrato.md`.
2. **Planeje antes:** proponha um plano curto (arquivos a criar ou alterar, decisões em aberto) e espere a aprovação.
3. **Execute em ordem:** back, depois front. Uma branch com o nome da sprint em cada repositório tocado (ex.: `sprint-02-login`).
4. **Feche a sprint:** `npm run typecheck` no back e `npx tsc --noEmit` no front; marque a sprint como feita; escreva no Registro no máximo 8 linhas (o que foi feito, decisões, pendências); atualize `docs/api-contrato.md` com as rotas novas ou alteradas.
5. **Seja breve nas respostas:** relate o que mudou e onde, sem repetir código já aplicado.
6. **Se a janela ficar pesada** (contexto compactando) antes do fim: registre o ponto exato onde parou no Registro e peça para abrir outra janela com "continuar Sprint N".
7. O usuário testa no navegador; não rodar Playwright nem screenshots sem pedido. Para desfazer, editar manualmente; nunca `git checkout`, `git reset` ou `git restore`.

## Decisões técnicas já tomadas

- Better Auth só para login, senha, Google, 2FA e sessões (PRD Acesso, A22 e RT-AB01). Sem os plugins `organization` e `admin`.
- Organizações, perfis, permissões, convites, status do usuário e auditoria são tabelas do iEzer.
- Toda alteração de dados grava no `AuditLog` a partir da Sprint 3 (helper único), para a aba Histórico e a tela de Auditoria funcionarem com dados reais.

## Mapa das sprints

| Sprint | Tema                                                 | Repos                     | Gate                                        |
| ------ | ---------------------------------------------------- | ------------------------- | ------------------------------------------- |
| 1      | Base de dados: organizações, Person, User, AuditLog  | back                      |                                             |
| 2      | Login real                                           | back + front              |                                             |
| 3      | Permissões, organização ativa e helper de auditoria  | back + front              | Pessoas pode começar                        |
| 4      | Pessoas: modelo e API                                | back                      |                                             |
| 5      | Pessoas: listagem, cadastro rápido e PersonPicker    | front (+ ajustes no back) |                                             |
| 6      | Convite, recuperação de senha e onboarding da igreja | back + front              | Equipe da piloto entra com contas próprias  |
| 7      | Pessoas: perfil da pessoa e família                  | back + front              |                                             |
| 8      | Configurações: usuários e perfis de acesso           | back + front              |                                             |
| 9      | Pessoas: ciclo de vida, acompanhamento e Painel      | back + front              |                                             |
| 10     | Auditoria e aba Histórico                            | back + front              |                                             |
| 11     | Pessoas: importação pela planilha modelo             | back + front              |                                             |
| 12     | Google, 2FA, alertas e Minha conta                   | back + front              | **Gate de produção:** dados reais da piloto |
| 13     | Acesso do suporte                                    | back + front              |                                             |

Depois do MVP: itens F2 dos dois PRDs, priorizados com a igreja piloto.

---

## Sprint 1 — Base de dados `[x]`

**Objetivo:** o banco passa a ter organizações, pessoa e usuário ligados, sem quebrar o financeiro.

- `Organization` em dois níveis (`parentId`), contatos da conta (responsável pela conta, encarregado de LGPD).
- `organizationId` obrigatório em todas as tabelas de negócio; dados atuais vão para a sede.
- `Member` → `Person` só renomeando (campos novos ficam na Sprint 4); `Receivable.memberId` → `personId`.
- Model `User` atual adaptado às tabelas do Better Auth (user, session, account, verification e campos do `twoFactor`), com `personId` único; dizer o que acontece com `passwordHash`.
- `AuditLog` com autor, tipo de autor, organização, alvo, antes e depois, IP e dispositivo.
- Não instalar Better Auth nem implementar login.
- **IDs:** RT-AB02, RT-AB03, RT-AB10; Acesso › Migração; Pessoas › Migração do modelo atual.
- **Pronto quando:** a migração roda num banco de desenvolvimento e o financeiro continua funcionando.

## Sprint 2 — Login real `[ ]`

**Objetivo:** ninguém usa o app sem conta.

- Remover ou mover o módulo placeholder em `/api/auth` antes de montar o handler do Better Auth nesse caminho.
- Better Auth no Fastify: e-mail e senha, `minPasswordLength: 12`, `haveIBeenPwned`, sessão de 7 dias com `updateAge` de 1 dia, sem cookie cache.
- Middleware que exige sessão em todas as rotas e confere o status do usuário; `GET /me`; script que cria um usuário de teste.
- Front: login real, rotas protegidas, 401 volta ao login, header com usuário real; sai o flag do `localStorage`.
- Criar `docs/api-contrato.md`.
- **IDs:** RF-LG01, RF-LG03, RF-LG05, RF-LG06, RT-AB01, RT-AB04, RT-AF01, RT-AF04, RT-AF05, RT-AF07; Segurança e sessão (linhas Senha, Sessão, Tentativas).
- **Pronto quando:** entrar e sair funciona e nenhuma rota de dados responde sem login.

## Sprint 3 — Permissões, organização ativa e auditoria `[ ]`

**Objetivo:** cada usuário vê só o que o perfil permite, na organização certa, e toda alteração fica registrada.

- Catálogo em código (Acesso, Pessoas e Financeiro mínimo), com dependências; `GET /acesso/permissoes`.
- Perfis de fábrica com seed e restauração; atribuições usuário × perfil × organização; perfil na sede alcança as congregações.
- `requirePermission` e filtro por organização em todas as rotas atuais.
- Helper de auditoria usado em todas as alterações, na mesma transação.
- Front: `usePermission`, `<Can>`, organização ativa nas chaves do React Query, seletor de organização real, 403 com o nome amigável da permissão.
- **IDs:** Acesso › Permissões e Conceitos do domínio; RT-AB04 a RT-AB07, RT-AB10, RT-AF02, RT-AF03; Pessoas › Permissões (catálogo e padrão de fábrica); RF-OR02, RF-OR04, RF-OR05.
- **Pronto quando:** um usuário de teste com o perfil Tesoureiro não alcança nada além do permitido, e as alterações aparecem no `AuditLog` com autor.

## Sprint 4 — Pessoas: modelo e API `[ ]`

**Objetivo:** a API de Pessoas pronta para as telas.

- Campos novos de `Person`, vínculo e situação, `Family`/`FamilyMember`, `FollowUp`, consentimento, listas da igreja com seed evangélico.
- `GET /pessoas` paginado com busca e filtros no servidor; cadastro rápido; detecção de duplicados; redirecionamento da rota antiga.
- CPF único por organização com dígito verificador; telefone normalizado; datas civis como `@db.Date`.
- **IDs:** Pessoas › Decisões D1 a D15, Conceitos do domínio, Campos por seção (fase MVP), RF-C01, RF-C02, RF-C04, RF-L01 a RF-L04, RT-B01, RT-B03, RT-B05 a RT-B07, RT-B11, RT-B12, RF-S01, RF-S02.
- **Pronto quando:** as rotas respondem conforme o contrato e o typecheck passa.

## Sprint 5 — Pessoas: listagem, cadastro rápido e PersonPicker `[ ]`

**Objetivo:** a secretaria encontra e cadastra pessoas; Contas a Receber usa o seletor novo.

- Listagem `/app/pessoas` (tabela no desktop, cards no mobile, filtros num Sheet, atalhos de visão, skeleton, estado vazio).
- Cadastro rápido em modal com aviso de duplicado e responsável para menores.
- `PersonPicker` com busca no servidor, substituindo o Select de membro em Contas a Receber; item Membros sai de Operação › Cadastro.
- Ajustes pequenos no back se o contrato pedir.
- **IDs:** RF-L01 a RF-L07, RF-C01 a RF-C04, D8, RT-F01, RT-F02, RT-F03, RT-F06, RT-F07, RT-F08, RT-F09.
- **Pronto quando:** cadastrar, buscar e filtrar funcionam no desktop e no celular, e Contas a Receber lança com o PersonPicker.

## Sprint 6 — Convite, recuperação e onboarding `[ ]`

**Objetivo:** a equipe da piloto entra com contas próprias, convidada pelo pastor.

- Serviço de e-mail transacional; convite com token de uso único (72h, hash), página `/convite/:token`, aceite dos termos.
- Hook do Better Auth que só cria usuário com convite válido para o e-mail.
- Recuperação de senha (1h, encerra as outras sessões); troca de e-mail pelo admin.
- Script que cria a igreja (sede, congregações, responsável pela conta, perfis de fábrica) e convida o primeiro admin, no lugar da tela de back-office enquanto houver só a piloto.
- Configurações › Organização (dados da sede, congregações, responsável somente leitura); checklist de primeiro acesso; aviso de admin único.
- **IDs:** RF-CV01 a RF-CV06, RF-CV08, RF-RS01 a RF-RS04, RF-OB01 a RF-OB04, RF-OR01, RF-OR03, RT-AB08, RT-AB09, RT-AB12, RF-LP07, RF-LP08.
- **Pronto quando:** o pastor convida a secretaria e ela entra de ponta a ponta.

## Sprint 7 — Pessoas: perfil e família `[ ]`

**Objetivo:** o perfil da pessoa como página, com edição por seção.

- `/app/pessoas/:id`: cabeçalho, abas (visão geral, dados pessoais, contato e endereço, família, vida na igreja, contribuições), edição por seção em modal.
- `CepInput` (ViaCEP), `CpfInput`, `Tabs`; família básica, filho a partir do responsável, endereço compartilhado.
- Contribuições em endpoint separado; aba Acesso (dar ou gerenciar acesso).
- Documentar o layout de página de detalhe no `CLAUDE.md` do front.
- **IDs:** Pessoas › Perfil da pessoa, Campos por seção, RF-F01 a RF-F04, RT-B04, RT-F04, RT-F05, RT-F10; Acesso › RF-US06.
- **Pronto quando:** dá para completar a ficha de uma pessoa e montar uma família pelo perfil.

## Sprint 8 — Configurações: usuários e perfis de acesso `[ ]`

**Objetivo:** o admin monta perfis e gerencia a equipe sozinho.

- Usuários: lista, editar atribuições, desativar, reativar, encerrar sessões.
- Perfis: criar, editar, duplicar, restaurar, excluir, prévia; tela de permissões com switches, dependências, cadeado e resumo em linguagem natural.
- Travas: protegidas, último admin, ninguém altera o próprio acesso, avisos por e-mail.
- **IDs:** RF-US01 a RF-US03, RF-US05, RF-PF01 a RF-PF05, Acesso › Travas de segurança; Pessoas › Tela de perfis e permissões.
- **Pronto quando:** o admin cria um perfil, atribui a alguém e as travas impedem os casos proibidos.

## Sprint 9 — Pessoas: ciclo de vida, acompanhamento e Painel `[ ]`

**Objetivo:** registrar a caminhada da pessoa e medir o cuidado.

- Ações do menu "⋯" com data e motivo, linha do tempo, promover pedindo só o que falta, apagar registro só sem vínculos.
- Acompanhamento no perfil e na listagem.
- Suspensão automática do acesso quando a situação sai de Ativo.
- Indicadores da jornada no Painel (só contadores, lista filtrada respeitando permissões).
- **IDs:** RF-V01 a RF-V06, RT-B02, RT-B13, Indicadores da jornada no Painel (MVP), RF-P10; Acesso › RF-US04, RT-AB13.
- **Pronto quando:** visitante vira membro passando pela linha do tempo, e um usuário falecido ou desligado perde o acesso na hora.

## Sprint 10 — Auditoria e aba Histórico `[ ]`

**Objetivo:** a igreja consulta quem fez o quê.

- Configurações › Auditoria com filtros e exportação registrada; consulta por pessoa.
- Aba Histórico no perfil da pessoa.
- Conferir que todas as alterações das sprints anteriores gravam no log; log somente inclusão no banco.
- **IDs:** RF-LP01 a RF-LP06, RF-P03; Pessoas › aba Histórico.
- **Pronto quando:** cada alteração feita até aqui aparece com autor, e a aba Histórico mostra o histórico da pessoa.

## Sprint 11 — Pessoas: importação pela planilha modelo `[ ]`

**Objetivo:** a base da piloto entra sem redigitação.

- Planilha `.xlsx` gerada por organização com as listas da igreja, instruções, exemplo e versão oculta.
- Pré-visualização sem gravar, duplicados, confirmação atômica com declaração de consentimento, relatório final.
- **IDs:** RF-I01 a RF-I08, RT-B10, RF-P08, RF-P09.
- **Pronto quando:** uma planilha de teste com erros, duplicados e menores sem responsável é tratada como o PRD descreve.

## Sprint 12 — Google, 2FA, alertas e Minha conta `[ ]`

**Objetivo:** fechar a segurança antes dos dados reais.

- Google só para e-mail com usuário ou convite; plugin `twoFactor` (TOTP e código por e-mail, códigos de recuperação).
- Regras do iEzer: 2FA obrigatório para quem tem permissão protegida (exceto login pelo Google); bloqueio por e-mail após 5 erros.
- Alertas por e-mail; Minha conta (senha, 2FA, sessões, meus acessos, trocar e-mail).
- **IDs:** RF-LG02, RF-LG04, RF-CV07, RF-RS05, RF-MC01 a RF-MC06; Acesso › Segurança e sessão (2FA, Alertas, Encerramento imediato).
- **Pronto quando:** o Pastor de teste é obrigado a configurar o 2FA e o login com Google funciona.
- **Gate de produção:** depois desta sprint, a base real da igreja piloto pode ser importada.

## Sprint 13 — Acesso do suporte `[ ]`

- `SupportGrant`, autorização pelo admin, faixa de acesso ativo, revogação, bloqueio de notas pastorais, emergência com dupla aprovação.
- **IDs:** RF-SP01 a RF-SP12, RT-AB11.

---

## Registro

Entradas curtas (até 8 linhas), mais recente por último.

- 09/10/2026 · Preparação · PRDs e plano no repo; CLAUDE.md criado; Better Auth escolhido; plano reorganizado em sprints.
- 09/10/2026 · Sprint 1 · Migrações reiniciadas: `20260801_baseline` (schema anterior, substitui as 4 migrações antigas, marcada como aplicada no dev) + `20261009_acesso_base`. Backup CSV em `backups/` (fora do git).
  `Organization` com `type` SEDE/CONGREGACAO, `parentId` e CHECK (sede sem pai); `OrganizationContact` (RESPONSAVEL_CONTA, ENCARREGADO_LGPD; um por papel). Sede com id fixo `csedepiloto00000000000000` (`DEFAULT_ORGANIZATION_ID` em `src/lib/organization.ts`, provisório até a Sprint 3), nome "Sede" até o script da Sprint 6.
  `organizationId` NOT NULL em Supplier, Category, BankAccount, CostCenter, Person, Payable, Receivable; uniques agora por organização. Repositórios filtram/gravam com a sede.
  `Member` → `Person` (rename, dados mantidos); `Receivable.personId` (ainda `SetNull`). API sem mudança: `/cadastro/membros`, `memberId`/`memberName` mapeados para `personId`.
  `User` no formato Better Auth (`emailVerified`, `image`, `twoFactorEnabled`, `status` ATIVO/DESATIVADO/SUSPENSO, `lastLoginAt`, `personId String? @unique`) + `Session`, `Account`, `Verification`, `TwoFactor`. `passwordHash` removido: senha vai em `Account.password` (providerId "credential"). Conferir colunas com `@better-auth/cli generate` na Sprint 2/12.
  `AuditLog`: `actorType`, `actorUserId`, `organizationId`, `module` (+ACESSO, PESSOAS), `action`, `targetType/Id`, `before/after` JSONB, `ip`, `userAgent`. REVOKE UPDATE/DELETE fica para a Sprint 10.
  Pendências: `birthDate` → `@db.Date` e `Restrict` em `Receivable.personId` na Sprint 4; profundidade de 2 níveis validada na aplicação (CHECK só cobre sede sem pai). `.env` local está com CRLF.

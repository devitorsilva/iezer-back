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
| 14     | Homologação no navegador e correções                 | back + front              | Base real da piloto só depois do Go-live    |

Depois do MVP: itens F2 dos dois PRDs, priorizados com a igreja piloto.

**Go-live** (quando houver produção; antes de qualquer dado real da piloto):

- Banco de produção novo, separado do de homologação, com backup diário e, se o provedor permitir, na região de São Paulo. Com banco novo as migrações rodam do zero, sem `migrate resolve` do baseline.
- Domínio de e-mail no Resend com SPF e DKIM (RT-AB12).
- Texto final dos termos de uso e de confidencialidade (`TERMS_VERSION`) e contrato com a igreja com as cláusulas de operador.
- `docs/go-live.md`: variáveis do Render e da Vercel (com `BETTER_AUTH_SECRET` e segredo do Google próprios de produção), `migrate deploy`, seeds, `igreja:criar` com os dados reais, `suporte:agente`, conferências pós-deploy (IP, headers `x-vercel-ip-*`, `trustedOrigins`, cookie) e teste rápido.
- Homologação repetida em produção, só com dados fictícios, antes de importar a base real.

**Painel administrativo do iEzer** (depois do MVP; RT-AB14, A10, A11, RF-OB01). Virou o back-office das Sprints 15 a 22 (PRD `docs/prd/backoffice.md`); o texto abaixo fica como histórico. Hoje existe só o back-office do suporte em `/app/suporte`, mais os scripts `igreja:criar` e `suporte:agente`. O painel deve cobrir:

- igrejas: criação de igreja e congregações pela tela, no lugar do script;
- troca do responsável pela conta e do encarregado de LGPD, mediante documento;
- equipe iEzer: atendentes e papéis internos, inclusive quem aprova emergência;
- saúde: igrejas sem admin, e-mails que falharam, logins bloqueados e uso por igreja;
- auditoria interna da equipe;
- na F2, cobrança e autosserviço.

Decisão em aberto: o RT-AB14 pede autenticação própria da equipe, o que aponta para um app separado do da igreja. As rotas `/api/suporte/*` e o `SupportGrant` são reaproveitados.

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

## Sprint 2 — Login real `[x]`

**Objetivo:** ninguém usa o app sem conta.

- Remover ou mover o módulo placeholder em `/api/auth` antes de montar o handler do Better Auth nesse caminho.
- Better Auth no Fastify: e-mail e senha, `minPasswordLength: 12`, `haveIBeenPwned`, sessão de 7 dias com `updateAge` de 1 dia, sem cookie cache.
- Middleware que exige sessão em todas as rotas e confere o status do usuário; `GET /me`; script que cria um usuário de teste.
- Front: login real, rotas protegidas, 401 volta ao login, header com usuário real; sai o flag do `localStorage`.
- Criar `docs/api-contrato.md`.
- **IDs:** RF-LG01, RF-LG03, RF-LG05, RF-LG06, RT-AB01, RT-AB04, RT-AF01, RT-AF04, RT-AF05, RT-AF07; Segurança e sessão (linhas Senha, Sessão, Tentativas).
- **Pronto quando:** entrar e sair funciona e nenhuma rota de dados responde sem login.

## Sprint 3 — Permissões, organização ativa e auditoria `[x]`

**Objetivo:** cada usuário vê só o que o perfil permite, na organização certa, e toda alteração fica registrada.

- Catálogo em código (Acesso, Pessoas e Financeiro mínimo), com dependências; `GET /acesso/permissoes`.
- Perfis de fábrica com seed e restauração; atribuições usuário × perfil × organização; perfil na sede alcança as congregações.
- `requirePermission` e filtro por organização em todas as rotas atuais.
- Helper de auditoria usado em todas as alterações, na mesma transação.
- Front: `usePermission`, `<Can>`, organização ativa nas chaves do React Query, seletor de organização real, 403 com o nome amigável da permissão.
- **IDs:** Acesso › Permissões e Conceitos do domínio; RT-AB04 a RT-AB07, RT-AB10, RT-AF02, RT-AF03; Pessoas › Permissões (catálogo e padrão de fábrica); RF-OR02, RF-OR04, RF-OR05.
- **Pronto quando:** um usuário de teste com o perfil Tesoureiro não alcança nada além do permitido, e as alterações aparecem no `AuditLog` com autor.

## Sprint 4 — Pessoas: modelo e API `[x]`

**Objetivo:** a API de Pessoas pronta para as telas.

- Campos novos de `Person`, vínculo e situação, `Family`/`FamilyMember`, `FollowUp`, consentimento, listas da igreja com seed evangélico.
- `GET /pessoas` paginado com busca e filtros no servidor; cadastro rápido; detecção de duplicados; redirecionamento da rota antiga.
- CPF único por organização com dígito verificador; telefone normalizado; datas civis como `@db.Date`.
- **IDs:** Pessoas › Decisões D1 a D15, Conceitos do domínio, Campos por seção (fase MVP), RF-C01, RF-C02, RF-C04, RF-L01 a RF-L04, RT-B01, RT-B03, RT-B05 a RT-B07, RT-B11, RT-B12, RF-S01, RF-S02.
- **Pronto quando:** as rotas respondem conforme o contrato e o typecheck passa.

## Sprint 5 — Pessoas: listagem, cadastro rápido e PersonPicker `[x]`

**Objetivo:** a secretaria encontra e cadastra pessoas; Contas a Receber usa o seletor novo.

- Listagem `/app/pessoas` (tabela no desktop, cards no mobile, filtros num Sheet, atalhos de visão, skeleton, estado vazio).
- Cadastro rápido em modal com aviso de duplicado e responsável para menores.
- `PersonPicker` com busca no servidor, substituindo o Select de membro em Contas a Receber; item Membros sai de Operação › Cadastro.
- Ajustes pequenos no back se o contrato pedir.
- **IDs:** RF-L01 a RF-L07, RF-C01 a RF-C04, D8, RT-F01, RT-F02, RT-F03, RT-F06, RT-F07, RT-F08, RT-F09.
- **Pronto quando:** cadastrar, buscar e filtrar funcionam no desktop e no celular, e Contas a Receber lança com o PersonPicker.

## Sprint 6 — Convite, recuperação e onboarding `[x]`

**Objetivo:** a equipe da piloto entra com contas próprias, convidada pelo pastor.

- Serviço de e-mail transacional; convite com token de uso único (72h, hash), página `/convite/:token`, aceite dos termos.
- Hook do Better Auth que só cria usuário com convite válido para o e-mail.
- Recuperação de senha (1h, encerra as outras sessões); troca de e-mail pelo admin.
- Script que cria a igreja (sede, congregações, responsável pela conta, perfis de fábrica) e convida o primeiro admin, no lugar da tela de back-office enquanto houver só a piloto.
- Configurações › Organização (dados da sede, congregações, responsável somente leitura); checklist de primeiro acesso; aviso de admin único.
- **IDs:** RF-CV01 a RF-CV06, RF-CV08, RF-RS01 a RF-RS04, RF-OB01 a RF-OB04, RF-OR01, RF-OR03, RT-AB08, RT-AB09, RT-AB12, RF-LP07, RF-LP08.
- **Pronto quando:** o pastor convida a secretaria e ela entra de ponta a ponta.

## Sprint 7 — Pessoas: perfil e família `[x]`

**Objetivo:** o perfil da pessoa como página, com edição por seção.

- `/app/pessoas/:id`: cabeçalho, abas (visão geral, dados pessoais, contato e endereço, família, vida na igreja, contribuições), edição por seção em modal.
- `CepInput` (ViaCEP), `CpfInput`, `Tabs`; família básica, filho a partir do responsável, endereço compartilhado.
- Contribuições em endpoint separado; aba Acesso (dar ou gerenciar acesso).
- Documentar o layout de página de detalhe no `CLAUDE.md` do front.
- **IDs:** Pessoas › Perfil da pessoa, Campos por seção, RF-F01 a RF-F04, RT-B04, RT-F04, RT-F05, RT-F10; Acesso › RF-US06.
- **Pronto quando:** dá para completar a ficha de uma pessoa e montar uma família pelo perfil.

## Sprint 8 — Configurações: usuários e perfis de acesso `[x]`

**Objetivo:** o admin monta perfis e gerencia a equipe sozinho.

- Usuários: lista, editar atribuições, desativar, reativar, encerrar sessões.
- Perfis: criar, editar, duplicar, restaurar, excluir, prévia; tela de permissões com switches, dependências, cadeado e resumo em linguagem natural.
- Travas: protegidas, último admin, ninguém altera o próprio acesso, avisos por e-mail.
- **IDs:** RF-US01 a RF-US03, RF-US05, RF-PF01 a RF-PF05, Acesso › Travas de segurança; Pessoas › Tela de perfis e permissões.
- **Pronto quando:** o admin cria um perfil, atribui a alguém e as travas impedem os casos proibidos.

## Sprint 9 — Pessoas: ciclo de vida, acompanhamento e Painel `[x]`

**Objetivo:** registrar a caminhada da pessoa e medir o cuidado.

- Ações do menu "⋯" com data e motivo, linha do tempo, promover pedindo só o que falta, apagar registro só sem vínculos.
- Acompanhamento no perfil e na listagem.
- Suspensão automática do acesso quando a situação sai de Ativo.
- Indicadores da jornada no Painel (só contadores, lista filtrada respeitando permissões).
- **IDs:** RF-V01 a RF-V06, RT-B02, RT-B13, Indicadores da jornada no Painel (MVP), RF-P10; Acesso › RF-US04, RT-AB13.
- **Pronto quando:** visitante vira membro passando pela linha do tempo, e um usuário falecido ou desligado perde o acesso na hora.

## Sprint 10 — Auditoria e aba Histórico `[x]`

**Objetivo:** a igreja consulta quem fez o quê.

- Configurações › Auditoria com filtros e exportação registrada; consulta por pessoa.
- Aba Histórico no perfil da pessoa.
- Conferir que todas as alterações das sprints anteriores gravam no log; log somente inclusão no banco.
- **IDs:** RF-LP01 a RF-LP06, RF-P03; Pessoas › aba Histórico.
- **Pronto quando:** cada alteração feita até aqui aparece com autor, e a aba Histórico mostra o histórico da pessoa.

## Sprint 11 — Pessoas: importação pela planilha modelo `[x]`

**Objetivo:** a base da piloto entra sem redigitação.

- Planilha `.xlsx` gerada por organização com as listas da igreja, instruções, exemplo e versão oculta.
- Pré-visualização sem gravar, duplicados, confirmação atômica com declaração de consentimento, relatório final.
- **IDs:** RF-I01 a RF-I08, RT-B10, RF-P08, RF-P09.
- **Pronto quando:** uma planilha de teste com erros, duplicados e menores sem responsável é tratada como o PRD descreve.

## Sprint 12 — Google, 2FA, alertas e Minha conta `[x]`

**Objetivo:** fechar a segurança antes dos dados reais.

- Google só para e-mail com usuário ou convite; plugin `twoFactor` (TOTP e código por e-mail, códigos de recuperação).
- Regras do iEzer: 2FA obrigatório para quem tem permissão protegida (exceto login pelo Google); bloqueio por e-mail após 5 erros.
- Alertas por e-mail; Minha conta (senha, 2FA, sessões, meus acessos, trocar e-mail).
- **IDs:** RF-LG02, RF-LG04, RF-CV07, RF-RS05, RF-MC01 a RF-MC06; Acesso › Segurança e sessão (2FA, Alertas, Encerramento imediato).
- **Pronto quando:** o Pastor de teste é obrigado a configurar o 2FA e o login com Google funciona.
- Dados reais da piloto só entram depois do Go-live (ver "Go-live", depois do mapa).

## Sprint 13 — Acesso do suporte `[x]`

- `SupportGrant`, autorização pelo admin, faixa de acesso ativo, revogação, bloqueio de notas pastorais, emergência com dupla aprovação.
- **IDs:** RF-SP01 a RF-SP12, RT-AB11.

## Sprint 14 — Homologação no navegador e correções `[ ]`

**Objetivo:** validar no navegador, no ambiente de homologação atual, tudo o que até aqui foi testado só por typecheck e por HTTP.

- **[usuário]** Seguir `docs/homologacao.md` no desktop e no celular, primeiro sozinho e depois com o pastor. Anotar os achados na tabela do fim do roteiro.
- Enquanto o Resend não tiver domínio, os fluxos de e-mail (convite, código do 2FA, alertas, redefinição) são testados pelo log do back ou pelo "Copiar link".
- Claude Code: corrigir os achados em janelas "Sprint 14 — correções", em lotes por tela, começando pelos que bloqueiam. Já conhecido: botões de gestão visíveis ao atendente em somente leitura (Perfis, Organização).
- Usar só dados fictícios: o banco atual não tem backup e guarda registros de auditoria que não podem ser apagados.
- **Pronto quando:** o roteiro passa sem achados que bloqueiam, e o pastor percorreu as jornadas dele.

## Back-office do iEzer (Sprints 15 a 22)

Requisitos: `docs/prd/backoffice.md`, citados por ID (RF-BO, RT-BB, RT-BF e decisões B1 a B15). As regras das sprints valem iguais: nos PRDs, buscar só os IDs citados com `grep`.

A Sprint 14 (homologação no navegador) continua adiada; estas sprints vêm antes dela. O app admin é um segundo app no `iezer-front` (RT-BF01). Na seção Go-live, o item "Painel administrativo do iEzer" passa a apontar para estas sprints.

## Sprint 15 — Equipe iEzer e sessão da equipe (back) `[x]`

**Objetivo:** contas da equipe separadas das contas de igreja, com papéis e regras de segurança próprias.

- `TeamMember` com papéis (Administrador iEzer, Suporte, Implantação), status, quem convidou e aceite do termo. `User.personId` passa a aceitar nulo só para contas da equipe. `User.isSupportAgent` migra para `TeamMember` com papel Suporte, e o campo sai.
- Namespace `/api/admin/*` com `requireTeamRole` e `GET /api/admin/me`. Sessão de conta de igreja é recusada em `/api/admin/*`. As rotas `/api/suporte/*` continuam onde estão até a Sprint 19, para não quebrar o suporte atual.
- Regras da equipe em hooks e middleware: 2FA só por TOTP (OTP por e-mail recusado para conta da equipe), sessão revogada após 12h sem uso, bloqueio após 5 erros com aviso aos Administradores iEzer, e-mail de conta da equipe não pode ser de usuário de igreja, `trustedOrigins` com o segundo front.
- API da equipe: convite (72h, uso único), listar, mudar papéis, desativar e reativar, redefinir autenticador. Travas: ninguém altera os próprios papéis nem se desativa, e nunca fica sem Administrador iEzer ativo.
- E-mail a todos os Administradores iEzer a cada login da equipe. Ações da equipe sem igreja (login, equipe) gravam no `AuditLog` com organização nula.
- `npm run suporte:agente` vira o bootstrap do primeiro Administrador iEzer.
- Atualizar em `docs/prd/acesso.md` a A17, o RF-SP02 e o item "Prazos do suporte" das validações com os prazos da B15.
- **IDs:** B1 a B3, RF-BO03, RF-BO06 a RF-BO10, RF-BO55, RT-BB01 a RT-BB03, RT-BB12, RT-BB13; backoffice › Segurança da equipe; backoffice › Migração (linhas `isSupportAgent` e `suporte:agente`).
- **Pronto quando:** o primeiro Administrador iEzer, criado pelo script, convida um Suporte pela API; `/api/admin/*` recusa conta de igreja; e o login da equipe sem TOTP é recusado.

## Sprint 16 — App admin: estrutura, entrada e equipe (front) `[x]`

**Objetivo:** a equipe entra num app próprio e gere a si mesma.

- Segundo app no `iezer-front`, com build próprio, reaproveitando `ui/*`, os campos padronizados e os padrões do `CLAUDE.md`, sem importar telas do app das igrejas. Título, favicon e cor de destaque próprios; `noindex`.
- Rotas `/login`, `/convite/:token`, `/minha-conta` e `/equipe`. Menu por papel com `useTeamRole` e `<CanTeam>`; `queryKeys` próprios do admin.
- Login com e-mail, senha e código do app autenticador. Primeiro acesso por convite: definir senha, configurar o autenticador, guardar os códigos de recuperação e aceitar o termo. Minha conta: senha, autenticador, códigos e sessões.
- Tela Equipe com as travas, tabela virando cards abaixo de `md` e skeleton espelhando o layout.
- **Pendência manual:** criar o projeto do app admin na Vercel (o Claude Code deixa o build pronto e descreve a configuração). Usa a URL da Vercel até haver domínio.
- **IDs:** RF-BO01, RF-BO03 a RF-BO10, RT-BF01 a RT-BF03, RT-BF06, RT-BF07.
- **Pronto quando:** um membro convidado entra pela primeira vez, configura o TOTP e vê só o menu do seu papel; uma conta de igreja não entra no app admin.

## Sprint 17 — Igrejas: lista, criação e detalhe (back + front) `[ ]`

**Objetivo:** criar e acompanhar igrejas sem terminal.

- `Organization.status` (IMPLANTACAO, ATIVA, SUSPENSA, ENCERRADA) na sede, com data e motivo da última mudança. As igrejas fictícias que já existem viram Ativa.
- Serviço único de criação de igreja, numa transação: sede, congregações, contatos, seed dos perfis de fábrica e das listas, Pessoa e convite do primeiro admin com o perfil Pastor na sede. A igreja nasce em Implantação. O script `igreja:criar` é removido.
- Telas: lista com busca por nome ou CNPJ e filtro por situação; "Nova igreja" com `CpfCnpjInput` (CNPJ alfanumérico) e bloqueio de CNPJ repetido; página da igreja com as abas Visão geral, Congregações e Usuários. As abas Pedidos de acesso e Histórico chegam nas Sprints 19 e 22.
- Editar sede, congregações e contatos da conta. Reenviar o convite de admin com motivo, aviso por e-mail ao responsável pela conta e registro na Auditoria da igreja.
- Nenhuma rota desta sprint devolve dados de pessoa além do que a B8 permite.
- **IDs:** B4, B5, B8, RF-BO11 a RF-BO18, RF-BO29, RF-BO32, RF-BO56, RT-BB04 (campo de situação), RT-BB05.
- **Pronto quando:** uma igreja criada pela tela nasce em Implantação com o convite do primeiro admin, e a aba Usuários mostra só nome, e-mail, perfis, status, último acesso.

## Sprint 18 — Situação da igreja e troca do responsável (back + front) `[ ]`

**Objetivo:** cada igreja tem um estado claro, e a troca do responsável fica documentada.

- "Marcar como ativa" (só com admin ativo), "Suspender" e "Reativar", com motivo e e-mails. A checagem de sessão do app das igrejas recusa igreja suspensa ou encerrada, e o app das igrejas ganha a tela de igreja suspensa.
- Supabase Storage: bucket privado, upload só pelo back (10 MB, tipo conferido pelo conteúdo), caminho por organização, links assinados de 5 minutos com cada abertura registrada. `AccountDocument` com tipo, data, número da ata, arquivo e data de descarte.
- Troca do responsável pela conta com documento e anexo; e-mails ao anterior, ao novo e aos admins; histórico de responsáveis.
- Componente `FileUpload`, passando pelo checklist da CLI.
- **Pendência manual:** criar o bucket no Supabase (o Claude Code descreve como).
- **IDs:** B5, B7, RF-BO19 a RF-BO21, RF-BO25 a RF-BO28, RF-BO57, RF-BO58, RT-BB04, RT-BB06, RT-BF04 (tela de igreja suspensa), RT-BF05.
- **Pronto quando:** suspender derruba as sessões da igreja e mostra a tela de suspensa; a troca sem anexo é recusada; e o link do anexo expira.

## Sprint 19 — Suporte no back-office: ações sem acesso e pedidos de acesso (back + front) `[ ]`

**Objetivo:** o suporte sai do app das igrejas e passa a seguir os novos prazos.

- **Antes de planejar:** conferir como o atendente vê os dados hoje com o grant ativo (validação "Modo suporte" do PRD) e propor o desenho do RF-BO38.
- Mover `/api/suporte/*` para `/api/admin/*` e remover `/app/suporte` do app das igrejas.
- Redefinir 2FA de admin (com verificação anotada) e destravar login, sempre com motivo, aviso ao responsável pela conta e auditoria. Recuperação de admin no back-office, sem mudar as regras.
- `SupportGrant`: escrita passa antes pelo Administrador iEzer; prazo a partir da aprovação da igreja (24h padrão, 72h máximo); pedido sem resposta expira em 7 dias; autor diferente do aprovador; Implantação só pede leitura e só com a igreja em Implantação; encerrar pelo back-office; emergência aprovada por outro Administrador iEzer.
- Modo suporte: conta da equipe só entra no app das igrejas com pedido ativo, nos módulos do escopo, com a faixa fixa. Fora disso, sessão da equipe é recusada no app das igrejas.
- Aba Pedidos de acesso na página da igreja e lista geral de pedidos. Grants abertos em homologação são encerrados.
- **IDs:** B9, B15, RF-BO02, RF-BO30 a RF-BO40, RT-BB01, RT-BB03 (modo suporte), RT-BB11, RT-BF04 (saída de `/app/suporte` e faixa do modo suporte).
- **Pronto quando:** um pedido com escrita passa pelo Administrador iEzer antes da igreja, o prazo só começa na aprovação, ninguém aprova o próprio pedido, e `/app/suporte` não existe mais.

## Sprint 20 — Painel de saúde e e-mails da equipe (back + front) `[ ]`

**Objetivo:** a equipe percebe os problemas antes da igreja reclamar.

- Página inicial com os sete alertas por igreja, a partir de consultas agregadas que nunca devolvem dados de pessoa. Prazos (15, 7 e 30 dias) em parâmetros no código.
- Webhook do Resend com verificação de assinatura e `EmailEvent`; marca de e-mail rejeitado na aba Usuários. Sem domínio, testar com um evento simulado.
- E-mails para a equipe: pedido aprovado ou recusado, emergência aberta, igreja que ficou sem admin. Fecha a pendência da Sprint 13.
- **IDs:** B10, B12, RF-BO41 a RF-BO43, RF-BO54, RT-BB08, RT-BB09, RT-BB13.
- **Pronto quando:** uma igreja de teste sem admin aparece no painel e gera e-mail (no log) para Suporte e Administradores.

## Sprint 21 — Avisos em massa (back + front) `[ ]`

**Objetivo:** a equipe avisa as igrejas sem depender de e-mail em massa.

- `Announcement` e `AnnouncementView`. Tela de avisos, só para o Administrador iEzer: público, nível, início e fim, status (rascunho, agendado, no ar, encerrado) e contagem de quem viu e dispensou.
- `GET /me/avisos` e a faixa acima do header no app das igrejas. Informativo e manutenção podem ser dispensados; o importante fica até o fim.
- E-mail opcional aos admins e ao responsável pela conta quando o aviso entra no ar.
- **IDs:** B13, RF-BO44 a RF-BO49, RT-BB10, RT-BF04 (faixa de avisos).
- **Pronto quando:** um aviso para "só admins" das igrejas ativas aparece só para eles, no horário marcado, e some no fim.

## Sprint 22 — Fim de contrato e auditoria interna (back + front) `[ ]`

**Objetivo:** encerrar uma igreja com os dados devolvidos e ver tudo o que a equipe fez.

- Exportação em segundo plano: uma planilha por conjunto num `.zip` no Storage, link de uso único de 7 dias ao responsável pela conta, download registrado, rotina diária que apaga os vencidos. Notas pastorais, quando existirem, vão num arquivo separado só para quem tem a permissão.
- Registrar a eliminação definitiva (quando, quem, documento) e passar a igreja para Encerrada. Escrever `docs/roteiro-eliminacao.md`: dados, arquivos no Storage, prazo dos backups do Supabase, trava do audit log e comprovante à igreja.
- Tela Auditoria interna (filtros por membro, igreja, ação e período) e aba Histórico na página da igreja.
- Conferir as rotinas agendadas no Render (expirar pedidos, apagar exportações, painel).
- **IDs:** B6, B11, B14, RF-BO15, RF-BO22 a RF-BO24, RF-BO51, RF-BO52, RF-BO59 a RF-BO61, RT-BB07, RT-BB12, RT-BB14.
- **Pronto quando:** a exportação de uma igreja de teste chega por link ao responsável (no log) sem a equipe conseguir baixá-la, e as ações feitas pela equipe nas sprints 15 a 22 aparecem na auditoria interna.

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
- 09/10/2026 · Sprint 2 · Better Auth 1.7.7 em `src/lib/auth.ts` (senha 12–128, HIBP, sessão 7d/updateAge 1d, sem cookie cache, `disableSignUp` até a Sprint 6, IDs cuid pelo Prisma, `status/personId/lastLoginAt` como additionalFields). Handler em `src/modules/auth/routes.ts` (placeholder removido). Schema conferido com `@better-auth/cli generate`: sem migração.
  Status: hook `session.create.before` recusa não-ATIVO no login (403 `USER_INACTIVE`, RF-LG06); `requireSession` (`src/lib/require-session.ts`) protege tudo em `/api` exceto `/api/auth/*` e repete a checagem a cada requisição. `GET /me` sem organizações (Sprint 3). Script `npm run user:create`.
  Produção de teste: front em `iezer.vercel.app` e back no Render são sites diferentes → `vercel.json` repassa `/api/*` ao Render (cookie first-party); no Render, `BETTER_AUTH_URL` e `WEB_ORIGIN` = `https://iezer.vercel.app`, mais `BETTER_AUTH_SECRET`. Front usa `/api` relativo no build.
  Front: `useMe` (React Query) é a sessão; 401/403 zeram o `me` e o login volta à tela de origem; flag do `localStorage`, `mock-usuario.ts` e itens "Em breve" do menu da conta removidos; "Cadastre-se" removido; "Esqueceu a senha?" e Google inativos.
  Pendências: confirmar URL do Render no `vercel.json`; limite por IP em memória (uma instância) e atrás de dois proxies (Vercel + Render) — conferir IP gravado em `Session.ipAddress` no deploy; preview deployments da Vercel ficam fora do `trustedOrigins`; regras de senha (e-mail, nome da igreja) e bloqueio por e-mail nas Sprints 6 e 12; falha de banco em `getSession` vira 500, não 503.
- 10/10/2026 · Sprint 3 · Migração `20261010_permissoes`: `AccessProfile` (da sede, `factoryKey`), `AccessProfilePermission`, `UserAssignment`. Catálogo em `src/modules/acesso/permissoes/catalog/` (27 chaves, dependências, protegidas, padrão de fábrica); `npm run acesso:seed` e `npm run user:assign`.
  `resolveOrganization` (`src/lib/access.ts`): `X-Organization-Id` + `X-Organization-Scope: todas`; permissões = organização + sede; `requirePermission` por rota em cadastro e financeiro; registros fora do escopo dão 404; criar em "todas" dá 400; referências cruzadas entre organizações dão 400. `GET /me` com `organizations`; `GET /acesso/permissoes`, `GET /acesso/perfis`, `POST /acesso/perfis/:id/restaurar` (travas de protegida e último admin).
  `runAudited` (`src/lib/audit.ts`) em toda escrita, `$transaction` interativa (funciona no pooler; a nota antiga estava errada). `trustProxy` ligado para o IP do log.
  Front: `ActiveOrganizationProvider` (escolha em `localStorage` por usuário, headers no `apiRequest`), `queryKeys.x(org)`, `usePermission`/`<Can>`, menu e rotas filtrados (`PermissionGate` com nome amigável do catálogo), seletor real, botões de ação somem sem permissão.
  Dev: perfis de fábrica criados na sede; `teste@iezer.local` = Pastor; `teste.tesoureiro@iezer.local` = Tesoureiro. Testado por API: Tesoureiro barrado em membros (criar) e perfis, auditoria com autor/IP.
  Decisões: cadastros financeiros por organização (sem herança da sede); "todas" só lê/edita/exclui; restaurar mantém o nome; perfil é da igreja e admin de congregação também restaura.
  Pendências: "ninguém altera o próprio acesso" e e-mails de concessão (Sprint 8); 2FA para protegidas (12); `POST /restaurar` não testado por HTTP; em "todas", lookups trazem cadastros de todas as organizações (editar com categoria de outra dá 400); no Render, rodar `prisma migrate deploy`, `acesso:seed` e `user:assign`.
- 10/10/2026 · Sprint 4 · **Incidente:** `prisma migrate diff` com o banco como shadow DB resetou o único banco (dev = Render, plano free sem backup): dados perdidos; `_prisma_migrations` refeita com `migrate resolve`, perfis com `acesso:seed`. Usuários de teste precisam ser recriados (`user:create` + `user:assign`). Regra nova no `CLAUDE.md`: comando que possa resetar o banco só com confirmação.
  Migração `20261010_pessoas`: `Person` com campos MVP, `bond`/`status`, CPF (DV) único por organização, telefones com DDI, datas `@db.Date` (conversão pelo dia mais próximo em UTC), `searchName` sem acento; saem `document`/`phone`/`isActive` (backfill: Membro, Ativo/Inativo, CPF ou outro documento). `Family`/`FamilyMember` (uma família por pessoa), `FollowUp` (só entidade; rotas na Sprint 9), `PersonConsent`, `ChurchListItem` na sede + `npm run pessoas:seed`. `Receivable.personId` → `Restrict`.
  Módulo `src/modules/pessoas/`: `GET /pessoas` (RT-B01), `/duplicados`, `/listas`, `/:id`, `POST` (cadastro rápido com responsável e consentimento), `PATCH` (dados cadastrais), `DELETE` (só sem vínculos). Regras de vínculo/menor em `rules.ts`; `missingFields`/`incomplete` no detalhe.
  `/cadastro/membros` virou camada de compatibilidade sobre `Person` (formato antigo) até a Sprint 5. `AppError` com `details`; `ZodError` agora dá 400 `VALIDATION_ERROR` em todas as rotas (antes 500). `RequestContext.churchId`.
  Decisões: listas por igreja (sede); duplicados só nas organizações que o usuário lê; consentimento obrigatório só para menor; sem `situacao`, a lista traz só Ativo; responsável = Responsável/Cônjuge maior de idade na família.
  Pendências: front (Sprint 5) troca para `/pessoas` + PersonPicker e remove a compatibilidade; registrar a exceção do telefone no `CLAUDE.md` do front; ordenar aniversariantes por dia; filho de pais separados (duas famílias); trocar papel na família e "aplicar a toda a família" (Sprint 7); testado só pelo service e por `inject` sem sessão (sem usuário no banco).
- 10/10/2026 · Sprint 5 · Back: `/cadastro/membros` removida; contas a receber com `personId`/`personName` + `organizationId` (`personId: null` desvincula, antes não dava); `GET /pessoas?sort=aniversario` (mês/dia, ordenado em memória). Sem migração. Sprint 4 commitada antes, na `sprint-04-pessoas`.
  Front (`sprint-05-pessoas`): seção Pessoas ativa em `/app/pessoas` (item igual ao caminho da seção vira index em `buildSectionRoutes`), Membros sai de Cadastro e `/app/cadastro/membros` redireciona (D8); item Pessoas real na barra mobile. `features/members` removido.
  Listagem: busca com debounce, atalhos de visão, filtros num Sheet (de baixo no mobile) com rascunho e "Aplicar", ordenação, paginação, filtros na URL, tabela/cards/skeleton, estado vazio com "Importar planilha" desabilitado, menu ⋯ (abrir, WhatsApp, ligar, apagar registro com 409 traduzido).
  Cadastro rápido: campos do vínculo, checkbox "É WhatsApp", CPF (`cpfOnly`), duplicados com debounce (CPF bloqueia), responsável (PersonPicker ≥18 ou cadastrar agora) e consentimento para menor/Membro em formação, erros do back nos campos, "Salvar e completar perfil".
  `PersonPicker` (Popover + `cmdk`, busca no servidor) em Contas a Receber e no responsável. `ui/command.tsx` e `ui/checkbox.tsx` escritos à mão (sem CLI). Perfil `/app/pessoas/:id` provisório (cabeçalho + campos faltando) até a Sprint 7.
  Decisões: em "todas" dá para cadastrar pessoa escolhendo a congregação (o back aceita `organizationId`); filtro de congregação só aparece em "todas"; consentimento só é pedido para menor.
  Pendências: testado só por typecheck/build e leitura no banco (sem usuário de teste após o incidente); ordenar aniversariantes em memória não escala para bases muito grandes; no Render, nada novo além do deploy.
- 10/10/2026 · Sprint 6 · Migração `20261010_convites` (aditiva): `Invite`/`InviteAssignment` (token só como SHA-256, 72h, um pendente por e-mail via índice parcial), `User.termsVersion/termsAcceptedAt`, `Organization.congregationsReviewedAt`. Back: `/convites/:token` público (ver e aceitar; o aceite cria usuário, senha e atribuições numa transação e já faz o login), `/acesso/convites`, `/acesso/usuarios` (lista e troca de e-mail), `/acesso/onboarding`, `/organizacao`, `POST /me/termos`; script `igreja:criar`.
  Better Auth: redefinição com token em hash, 1h, encerra sessões e manda e-mail de confirmação; hook `user.create.before` exige convite válido (trava para o Google na Sprint 12); regras de senha do iEzer (e-mail e nome da igreja) no aceite e na redefinição. Rotas de dados dão 403 `TERMS_REQUIRED` sem o aceite dos termos. E-mail pelo Resend (`src/lib/mailer.ts`); **sem domínio ainda**: sem `RESEND_API_KEY`, o e-mail vai para o log (com o link só em dev) e a tela mostra "Copiar link".
  Front: `/convite/:token`, `/esqueci-senha`, `/redefinir-senha/:token` (`AuthCardLayout`), aceite dos termos no `ProtectedLayout`, Configurações › Organização e › Usuários (Dar acesso com PersonPicker e cadastro rápido, linhas organização × perfis e resumo; reenviar, copiar link, trocar e-mail, cancelar), checklist e aviso de admin único no Painel e em Usuários. Sai a seção placeholder "Acesso".
  Decisões: "Copiar link" gera token novo (o banco não guarda o token); quem convida precisa de "Gerenciar usuários" na organização e das protegidas do perfil; `/acesso/perfis` liberado também para `acesso.usuarios.gerenciar`; Organização exige a permissão na sede; congregação só é desativada; texto dos termos provisório (`TERMS_VERSION = 2026-10-10`).
  Testado por HTTP: convite → aceite → `/me` → `/pessoas`, link antigo e reuso dão 404, Tesoureiro barrado, senhas curta/com e-mail/vazada/com nome da igreja recusadas, redefinição com sessões encerradas. Usuário criado: `teste.secretaria@iezer.local` (Secretário). Os usuários de teste antigos vão aceitar os termos no próximo login.
  Pendências: domínio + Resend (SPF/DKIM, RT-AB12); em produção sem chave, "Esqueci a senha" não entrega; limites em memória (uma instância); telas de Organização e Usuários testadas só por typecheck/build; no Render: `prisma migrate deploy` e, quando os dados reais chegarem, `igreja:criar` com `"sedeId": "csedepiloto00000000000000"` no JSON; RF-CV07 (2FA obrigatório) fica para a Sprint 12.
- 10/10/2026 · Sprint 7 · Sprint 6 commitada antes (`sprint-06-convite`, back e front). Back sem migração: slice `pessoas/familias` (`/pessoas/familias`: criar, renomear, adicionar, trocar papel, remover; trava do menor sem responsável em toda mudança; família vazia é apagada), `PATCH /pessoas/:id` com `applyToFamily` (endereço e telefone secundário, em lote), `GET /pessoas/:id/contribuicoes` e `GET /pessoas/:id/acesso`; membros da família com `bond`/`status`/`isGuardian`.
  Front (`sprint-07-perfil`): `/app/pessoas/:id` com cabeçalho, abas na URL (`ui/tabs.tsx` à mão, `@radix-ui/react-tabs`), Visão geral, Dados pessoais, Contato e endereço, Família, Vida na igreja, Contribuições e Acesso (cada uma pela permissão); edição por seção em modal (`SecaoDialog`/`useEditarPessoa`); `CepInput` (ViaCEP); "aplicar a toda a família"; "Cadastrar filho" pelo cadastro rápido com `responsavelFixo`; "Dar acesso" com a pessoa já escolhida; "Apagar registro" no ⋯. Layout de página de detalhe no `CLAUDE.md` do front (RT-F10).
  Decisões: família pode juntar congregações diferentes; pessoa em outra família dá 409 (remover antes, sem mover automático); último acompanhamento na Visão geral fica para a Sprint 9; CPF pelo `CpfCnpjInput cpfOnly`; vínculo e congregação só leitura até a Sprint 9.
  Testado por HTTP (usuário novo `teste.sprint7@iezer.local`, Pastor; para usar, redefina a senha com `npm run user:create`): travas de responsável, 409 de família, aplicar à família (inclusive o 400 de contato), renomear, família apagada ao sair o último, contribuições e acesso. Pessoas de teste "Teste Sete …" (e a "Família Sete") ficaram no banco para o teste visual.
  Pendências: banco remoto lento daqui (~1–3 s por consulta) chegou perto do timeout de 15 s da transação; telas testadas só por typecheck/build; "Gerenciar acesso" leva a Configurações › Usuários até a Sprint 8; família não aparece na listagem (F2).
- 13/10/2026 · Sprint 8 · Sprint 7 commitada antes (`sprint-07-perfil`, back e front). Back sem migração: travas em `src/modules/acesso/travas.ts` (`runGuarded`: retrato das protegidas antes e depois na transação → último admin e e-mails de concessão/admin removido após o commit; `assertCanChangeAssignments` agora compartilhado com convites). Perfis: criar, editar, excluir movendo usuários e convites, restaurar; permissões normalizadas (grupo + dependências); `userCount`/`inviteCount` no lugar de `assignmentCount`. Usuários: `PUT atribuicoes`, desativar, reativar, encerrar sessões.
  Front (`sprint-08-configuracoes`): Configurações › Perfis de acesso (lista, menu ⋯, excluir com destino, restaurar, prévia em Sheet) e tela de permissões `/app/configuracoes/perfis/:id` (`/novo?duplicar=id`) com switches por módulo, cadeado, dependências com aviso e resumo em linguagem natural (`features/perfis/model/permissoes.ts`). Usuários: filtros status/perfil/organização, Editar acessos (`AtribuicoesEditor` compartilhado com Dar acesso), desativar/reativar/encerrar sessões; aba Acesso da pessoa edita os acessos ali. Abas do perfil da pessoa em `pessoas/model/abas-perfil.ts` (também usadas pela prévia).
  Decisões: perfil de fábrica não se exclui; alterar atribuição ou perfil com protegida (inclusive para retirar) exige tê-la; desativar/reativar/encerrar exigem gerenciar em todas as organizações do usuário; editar perfil que você usa é permitido; aviso de concessão também no aceite do convite.
  Testado por HTTP (`teste.sprint8a@iezer.local` Pastor, `teste.sprint8b@iezer.local` Secretário; redefina a senha com `npm run user:create`): criar com dependências, chave desconhecida, nome repetido, 403 sem permissão, `LAST_ADMIN` ao tirar admin do Pastor, editar acessos, `OWN_ACCESS`, `NO_ASSIGNMENTS`, desativar (401 na hora) e reativar, encerrar sessões, excluir com/sem destino, `FACTORY_PROFILE`, restaurar, gestor sem "Gerenciar perfis" barrado ao desativar ou tirar admin. E-mails conferidos por script (sem Resend: só no log).
  Pendências: telas testadas só por typecheck/build; cada escrita de acesso faz 2 consultas a mais (retrato) — atenção ao timeout de 15 s com o banco remoto lento; reativar não confere a situação da pessoa (Sprint 9, RF-US04); 2FA para protegidas (Sprint 12); filtros de Usuários não ficam na URL.
- 13/10/2026 · Sprint 9 · Sprint 8 commitada antes (`sprint-08-configuracoes`, back e front; sem trailer de coautoria daqui em diante). Migração `20261013_ciclo_vida` (aditiva, aplicada com `migrate deploy`): `PersonEvent` (linha do tempo), `Person.bondSince` e `contactUpdatedAt` (com backfill), `Organization.peopleSettings`. Slice `pessoas/ciclo-vida`: promover (pede só o que falta, `promotionRequirements` no detalhe), inativar, transferir (interna/externa), desligar, falecimento, reativar, acompanhamentos e `GET /:id/linha-do-tempo`; `GET /pessoas/indicadores` + `?indicador=` (`pessoas/jornada.ts`).
  Suspensão automática em `acesso/suspensao.ts` na mesma transação (SUSPENSO, sessões apagadas, e-mail aos admins ou ao responsável pela conta), sem trava de último admin; reativar usuário de pessoa não Ativa dá 409 `PERSON_NOT_ACTIVE` (pendência da Sprint 8).
  Front (`sprint-09-ciclo-vida`): menu ⋯ do perfil com as ações por situação e permissão (`model/ciclo-vida.ts`), modais em `perfil/ciclo-vida-dialogs.tsx`, linha do tempo na aba Vida na igreja, último acompanhamento e "desde" do vínculo no card, acompanhamento no ⋯ da listagem, chip do indicador, card "Jornada das pessoas" no Painel, Reativar acesso bloqueado em Usuários com pessoa não Ativa.
  Decisões: linha do tempo em tabela própria (não no AuditLog); promover aceita voltar estágio e só com Ativo; transferência interna exige "Alterar situação" no destino e mantém situação/acesso; acompanhamento só cria; indicadores exigem `pessoas.ver`; prazos padrão 30/15/365/180 dias, sem tela.
  Testado por HTTP (`teste.sprint9@iezer.local` Pastor; redefina a senha com `npm run user:create`): visitante → novo convertido → membro com linha do tempo, campos faltando, data futura, motivo de outra lista, `INVALID_STATUS`, suspensão com 401 na hora (`teste.sprint9vol@iezer.local`), `PERSON_NOT_ACTIVE`, `STILL_SUSPENDED`, transferência externa e interna (ida e volta), indicadores e `?indicador=`, e-mail de suspensão por script. Ficaram no banco "Teste Nove Visitante", "Teste Nove Voluntária" e a "Congregação Teste Nove" (desativada).
  Pendências: telas testadas só por typecheck/build; tela de prazos dos indicadores; e-mail do suporte para igreja sem admin (hoje só log); editar/apagar acompanhamento (F2); permissão por rota não testada com perfil sem as chaves; no Render: `prisma migrate deploy`.
- 13/10/2026 · Sprint 10 · Sprint 9 commitada antes (`sprint-09-ciclo-vida`, back e front). Migração `20261013_trilha_auditoria` (aplicada com `migrate deploy`): `AuditLog.personIds` (GIN, preenchido nos registros antigos) e trigger de somente inclusão (RF-LP03), que só deixa apagar LOGIN com mais de 12 meses (RF-LP06). `runAudited` grava só os campos alterados (RF-LP05) e deduz `personIds`. Login, falha e logout passam a ir para o log (hooks do Better Auth, IP pelo header interno `x-iezer-client-ip`).
  Slice `acesso/auditoria`: lista com filtros e `/filtros` (escopo: igreja toda com a permissão na sede, inclusive congregações desativadas); `/exportar` em CSV (máx. 10 mil linhas, registrado como `exportar_auditoria`); `GET /pessoas/:id/historico`. Os rótulos de ações e campos ficam no back (`rotulos.ts`) e servem à tela e ao CSV.
  Inventário: todas as escritas de `src/` e dos scripts `igreja:criar`/`user:assign` já passavam por `runAudited`. Faltavam o login/logout e a pessoa nos acompanhamentos, e o `user:create` (só para dev) segue fora do log.
  Front (`sprint-10-auditoria`): Configurações › Auditoria com filtros na URL num Sheet (período, pessoa com PersonPicker, autor, módulo, ação, organização, Suporte iEzer), tabela que vira cards no mobile, detalhe em Sheet e "Exportar planilha"; aba Histórico no perfil com "Ver tudo na Auditoria"; `Paginacao` e `apiDownload`/`saveBlob` compartilhados.
  Decisões: a aba Histórico só traz o módulo Pessoas (o Secretário não vê financeiro nem acesso), e o histórico completo fica na Auditoria; falha de login com e-mail desconhecido fica sem organização; login entra na sede da igreja do usuário.
  Testado por HTTP (`teste.sprint9@iezer.local` Pastor, `teste.sprint8b@iezer.local` Secretário; redefina a senha com `npm run user:create`): falha de login, login, logout, edição minimizada com `personIds`, filtros, período inválido, exportação com os headers de CORS, histórico, Secretário barrado na Auditoria e com acesso ao Histórico. Trigger conferido só pela existência: o classificador barrou tentar UPDATE/DELETE no banco compartilhado.
  Pendências: telas testadas só por typecheck; job de expurgo dos logins com mais de 12 meses; acompanhamentos antigos sem `personIds` (não aparecem no Histórico); leitura de notas pastorais e impressões (F2); filtro "Suporte iEzer" sem dados até a Sprint 13; no Render: `prisma migrate deploy`.
- 13/10/2026 · Sprint 11 · Sprint 10 commitada antes (`sprint-10-auditoria`, back e front). Back sem migração: slice `pessoas/importacao` com `exceljs`. `GET /modelo` gera o `.xlsx` da organização ativa (instruções, exemplo, listas da igreja como dropdown, colunas em texto, `_meta` invisível com `pessoas-1`). `POST /previa` não grava. `POST /confirmar` confere de novo e grava numa transação só, com escritas em lote e ids gerados na aplicação (`src/lib/ids.ts`); `runAudited` ganhou `timeout` (120 s aqui) e grava o log em lotes. Declaração, totais e linhas recusadas vão num registro `importar`, e há um registro por pessoa.
  Regras: menor ou Membro em formação sem responsável maior (pelo CPF ou nome, primeiro na planilha e depois na base) é recusado, e menor também sem consentimento S. A criança entra como Filho na família do responsável. Duplicado = CPF, ou nome parecido + nascimento/celular/email; "atualizar" só preenche, sem mexer em vínculo, situação nem congregação. Linhas repetidas no arquivo: vale a primeira.
  Front (`sprint-11-importacao`): `/app/pessoas/importar` (`pessoas.importar`) em três etapas: modelo e envio; prévia com abas Novas/Já cadastradas (pular ou atualizar, também em lote)/Recusadas e a declaração; relatório com CSV. "Importar planilha" no cabeçalho e no estado vazio de Pessoas.
  Decisões: todos entram Ativos; vínculo sem o mínimo entra como cadastro incompleto (como as migradas); uma organização por arquivo ("todas" bloqueia); o relatório não fica salvo (o resumo fica na auditoria); modelo de outra versão é recusado.
  Testado por HTTP (`teste.sprint9@iezer.local` Pastor): planilha com erros de formato, menor sem responsável, menor sem consentimento, repetida, duplicado por celular (atualizado) e por email (pulado), responsável na planilha e na base, responsável com papel OUTRO, modelo antigo e arquivo inválido, "todas" bloqueado, declaração ausente. Família, consentimento (dado pelo responsável) e auditoria conferidos. Ficaram no banco "Teste Onze …" e o email novo de "Teste Nove Visitante".
  Ajustes após teste no navegador: formato texto célula a célula (o Numbers ignora o da coluna e tirava o zero do CPF). O Numbers apaga as abas ocultas ao exportar, então o código do modelo também fica visível nas Instruções e o cabeçalho é procurado em qualquer aba. Arquivo `.numbers` é recusado com a orientação de exportar para Excel. Testado com `.xlsx` exportado pelo Numbers.
  Pendências: tela testada pelo usuário só até a prévia; 11 linhas levaram 12 s com o banco remoto daqui; atualizações vão uma a uma (muitos "atualizar" ficam lentos fora do Render); planilha com mais de 2.000 pessoas precisa ser dividida; não há importação de situação, família entre adultos nem cônjuge; Gate de produção (dados reais) só depois da Sprint 12.
- 14/10/2026 · Sprint 12 · Sprint 11 commitada antes (`sprint-11-importacao`). Migração `20261013_seguranca` (aditiva, `migrate deploy`): campos do plugin em `TwoFactor`, `Session.twoFactorPending`/`location`, tabela `LoginLock`. Better Auth: Google (`GOOGLE_CLIENT_ID`/`SECRET`, `prompt=select_account`), plugin `twoFactor` (TOTP, código por e-mail de 10 min, 10 códigos de recuperação, 5 erros = 15 min), IP de `x-iezer-client-ip` em `Session.ipAddress`. Rotas de senha, e-mail e sessões do Better Auth fechadas ao navegador; Minha conta em `/api/me/*` (slice `me/conta`), confirmação de e-mail pública em `/api/email/confirmar/:token`, RF-RS05 em `POST /acesso/usuarios/:id/2fa/redefinir`.
  Regras: `requireSession` dá 403 `TWO_FACTOR_REQUIRED` (sessão do Google com 2FA, liberada pelo `verify-*` do plugin) e `TWO_FACTOR_SETUP_REQUIRED` (protegida sem 2FA, só `/api/me` responde); desligar o 2FA obrigatório dá 403. Google sem convite ou sem e-mail confirmado volta com `?error=INVITE_REQUIRED`; primeiro acesso pelo Google consome o convite ao abrir a sessão. Bloqueio por e-mail em `lib/login-lock.ts`; alertas e log dos eventos da conta em `lib/account-events.ts`; dispositivo novo = navegador+sistema fora dos logins de 90 dias.
  Front (`sprint-12-seguranca`): login com Google e etapa do código (`VerificacaoCodigo`), barreiras no `ProtectedLayout` (código pendente, configuração obrigatória com QR via `qrcode.react`), `/app/conta` (Minha conta), `/confirmar-email/:token`, "Continuar com Google" no convite (os termos marcados lá são aceitos na volta), "Minha conta" e nome preferido no header, "Redefinir verificação em duas etapas" em Usuários.
  Decisões: o Google **não** dispensa o 2FA (PRD A3, RF-CV07 e "2FA, quem" revistos na cópia local; falta copiar para a Doc); código por e-mail não gera códigos de recuperação (o plugin só gera com o app), então quem usa só e-mail recupera pelo admin; sem "lembrar este dispositivo"; local da sessão pelos headers `x-vercel-ip-*` quando vierem; troca de e-mail própria muda o e-mail da pessoa só se era o mesmo; código do 2FA fora do assunto do e-mail (em produção sem Resend o assunto vai para o log).
  Testado por HTTP (`teste.sprint9@iezer.local` Pastor, `teste.sprint8b@iezer.local` Secretária; senhas trocadas, redefina com `npm run user:create`, que também renomeou os dois): configuração obrigatória e barreira, TOTP, código por e-mail e de recuperação no login, desligar bloqueado, bloqueio no 6º erro (com e sem usuário) e aviso, sessões e alerta de dispositivo novo, Meus acessos, trocar senha, trocar e-mail ida e volta, redefinir 2FA pelo admin, sessão pendente do Google simulada no banco, início do Google com credenciais falsas (`redirect_uri` e `callbackURL` de fora recusado). No fim, o 2FA do Pastor de teste foi apagado no banco, para a configuração obrigatória aparecer no navegador.
  Pendências: login com Google real não testado (credenciais só no `.env` do usuário; trocar a chave secreta exposta no chat); telas testadas só por typecheck/build; Resend com domínio é pré-requisito do Gate (sem ele, em produção não chegam código por e-mail, alertas nem confirmação de e-mail); no Render: `prisma migrate deploy` e `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; copiar a revisão do A3/RF-CV07 para a Doc do PRD; os headers da Vercel chegam ao Render no rewrite (conferir no deploy).
- 14/10/2026 · Sprint 13 · Sprint 12 commitada antes nos dois repos. Migração `20261014_suporte` (aditiva, `migrate deploy`): `User.isSupportAgent` e `SupportGrant`. O atendente é um usuário nominal sem atribuições, com 2FA obrigatório (`npm run suporte:agente`). `loadAccessibleOrganizations` dá a ele as igrejas com grant ativo (expira pelo `expiresAt`, sem job), com as permissões do escopo, menos notas pastorais e `acesso.suporte.autorizar`. Ator `SUPORTE` no `getRequestContext`. Cada GET grava `suporte_ler` antes da resposta (`lib/support-log.ts`).
  Regras: somente leitura por padrão (403 `SUPPORT_READ_ONLY`); com escrita, ainda nada em `/acesso` e `/organizacao`; `config.denySupport` fica pronto para as notas pastorais (F2). Slice `acesso/suporte` (igreja) e back-office `/api/suporte/*`, com pedido, emergência com segundo atendente, cancelar/encerrar e recuperar admin (Pastor na sede ou convite).
  Front (`sprint-13-suporte`): Configurações › Acesso do suporte, com faixa em Configurações (RF-SP04), e `/app/suporte` (back-office). O atendente tem uma faixa no shell e, sem grant, cai no back-office; o `query-client` recarrega o `/me` em `SUPPORT_NO_GRANT`/`ORGANIZATION_FORBIDDEN`.
  Decisões: o grant é da equipe, não de um atendente; o escopo são módulos, valendo para a igreja inteira; um ativo por vez (409); a igreja não revoga a emergência, só o iEzer encerra; a recuperação de admin precisa de um atendente só, com a verificação anotada; ninguém é avisado na revogação.
  Testado por HTTP, com `teste.sprint13@iezer.local` (Pastor) e os atendentes `suporte.um`/`suporte.dois`/`suporte.tres@iezer.local` (2FA por e-mail; para trocar a senha, `npm run user:create`). Coberto: guardas, pedido e aprovação com prazo encurtado, leituras no log e no Histórico, bloqueio de escrita, escrita liberada, revogação, expiração simulada, emergência com dupla aprovação, recusa, cancelamento, recuperação de admin e atendente sem 2FA. Ficaram no banco os grants de teste e a pessoa "Teste Treze Novo Admin", com convite pendente.
  Pendências: telas testadas só por typecheck e build. Ajustes após teste no navegador: em acesso somente leitura, o front deixa o atendente só com as permissões de leitura (`SUPPORT_READ_ONLY_KEYS`), e as telas de gestão (Perfis, Organização) ainda mostram os botões. As leituras gravam o nome da tela (ex.: "Perfil da pessoa"), e o endereço só quando há busca ou filtro. O log de leitura virou INSERT direto (`recordAudit`, sem transação): com o banco em us-west-2 e pool de 5, as transações simultâneas de um perfil davam 500 (`Unable to start a transaction`). O `runAudited` ganhou `maxWait` de 10 s. Fornecedores: o back confere o dígito do CPF/CNPJ (inclusive alfanumérico, `isValidAnyCnpj`); os 5 fornecedores de teste têm documento inválido. A aba Histórico mostra só alterações (`READ_ACTIONS` fora); quem acessou a pessoa fica na Auditoria (RF-LP04), e o link da aba virou "Ver acessos e alterações na Auditoria". Ficaram 15 registros `teste_carga_sprint13` (Sistema) na auditoria. O GET recusado por permissão também vira `suporte_ler`. No Render: `migrate deploy` e marcar os atendentes reais; a equipe do suporte ainda não tem e-mail de aviso.
- 14/10/2026 · Preparação do back-office · PRD em `docs/prd/backoffice.md`; sprints 15 a 22 adicionadas; Sprint 14 continua adiada.
- 14/10/2026 · Sprint 15 · Branch `sprint-15-equipe` (só back). PRD renomeado para `docs/prd/backoffice.md`; rascunho `plano-backoffice-sprints.md` apagado. Migração `20261014_equipe` (`migrate deploy`; antes, CSV dos atendentes em `backups/sprint15-atendentes-*`): `TeamRole`, `TeamMember`, `TeamInvite` (pendente único por e-mail), `Session.lastActiveAt`, `ModuleKey.BACKOFFICE`; os 3 atendentes viraram `TeamMember` Suporte com o 2FA por e-mail zerado; `User.isSupportAgent` saiu.
  `lib/team.ts`: `request.team` no `requireSession`, sessão da equipe cai após 12h sem uso (401 `SESSION_IDLE`), 2FA só TOTP (`TEAM_TOTP_ONLY` em send/verify-otp e enable otp; Google recusado), `requireTeamSession`/`requireTeamRole`. Login e bloqueio da equipe avisam os Administradores (`lib/team-emails.ts`). `/api/admin/me`, `/api/admin/equipe/*` (convite, reenviar, cancelar, papéis, desativar, reativar, redefinir autenticador) e o convite público `/api/admin/convites/:token`. `/api/suporte/*` passa a exigir o papel Suporte.
  Decisões: status do membro = `User.status` + convite pendente (sem coluna duplicada); Administrador tem todos os papéis (vê `/app/suporte` no app das igrejas até a Sprint 19); log da equipe com autor `SUPORTE`, organização nula e módulo `BACKOFFICE`; travas com `pg_advisory_xact_lock`; e-mail da equipe e de igreja exclusivos (409 `TEAM_EMAIL`); equipe não troca e-mail em `/me/email`; o login da equipe não manda o alerta de dispositivo novo. `suporte:agente` agora só cria o primeiro Administrador (convite ou promoção de membro). A17, RF-SP02 e "Prazos do suporte" do PRD Acesso com a B15.
  Testado por HTTP (servidor na 3399): bootstrap (`admin.um@iezer.local`, igreja recusada), aceite com senha fraca e sem termo, uso único, barreira sem TOTP, OTP recusado no desafio e na ativação, TOTP com 10 códigos, convite do Suporte (`suporte.quatro@iezer.local`) com repetido, e-mail de igreja e membro recusados, travas de si mesmo, papéis, desativar/reativar, redefinir autenticador, cancelar convite, conta de igreja (`teste.sprint15@iezer.local`) recusada em `/api/admin` e `/api/suporte`, troca de e-mail para e-mail da equipe recusada, atendente migrado (`suporte.um`) com TOTP no `/api/suporte`, 12h ociosa simulada, bloqueio com aviso, alertas de login e auditoria.
  Senhas de teste: `admin.um` e `suporte.quatro` têm TOTP com o segredo só no scratchpad desta janela (para entrar no navegador, redefina o autenticador pela API ou apague o `TwoFactor`); `suporte.um` com senha nova e TOTP; ficou o convite cancelado de `cancelar.teste@iezer.local`.
  Pendências: `TEAM_LAST_ADMIN` não é alcançável pela API (quem age é Administrador ativo e não mexe em si), ficou como defesa; `/sign-in/email` ainda lista `otp` nos métodos da equipe (o app admin ignora); requisições da equipe a 10–20 s daqui pelo banco remoto. No Render: `migrate deploy` e `ADMIN_WEB_ORIGIN` (quando houver o app admin).
  Ajustes no front (ainda na `sprint-14-homologacao`, sem commit): código de 6 dígitos pelo `CodigoInput` (InputOTP do shadcn) no login e na configuração do 2FA; o `ProtectedLayout` pede o 2FA antes dos termos; código de recuperação também em InputOTP (5 + hífen + 5). Testado no navegador pelo usuário: `admin.um` configurou o TOTP, entrou com código de recuperação e chegou ao `/app/suporte`.
- 14/10/2026 · Sprint 16 · Branch `sprint-16-admin` nos dois repos (o front leva junto as correções da Sprint 14 que estavam sem commit: botões de gestão do atendente em somente leitura). Back: `POST /api/me/2fa/reconfigurar` (senha → apaga o app e encerra as outras sessões; log `reconfigurar_2fa` e alerta), porque o plugin recusa ativar de novo e o 2FA da equipe não desliga. `/api/me/*` grava como `SUPORTE` para a equipe.
  Front: segundo app em `admin/` (raiz do Vite, `npm run dev:admin` na 5174, `build:admin` → `dist-admin`, `noindex` + `robots.txt`, favicon e destaque âmbar), código em `src/admin/` que só importa de `src/components`, `src/lib` e `src/hooks`. Saíram de `features/` para uso dos dois apps: `lib/dois-fatores.ts`, `lib/conta.ts` (`contaApi`), `components/auth-card-layout.tsx` (prop `marca`), `nova-senha-campos.tsx` e `components/conta/` (senha, novos códigos, sessões, cards).
  Telas: `/login` (senha + TOTP ou código de recuperação; desafio sem TOTP ou `/admin/me` recusado = "Esta conta não tem acesso ao back-office do iEzer.", com logout), `/convite/:token` (senha + termo da equipe provisório), barreiras autenticador → termo, `AdminShell` com menu por papel (`useTeamRole`, `<CanTeam>`, `adminQueryKeys`), `/minha-conta` (senha, reconfigurar app, novos códigos, sessões) e `/equipe` (filtro, convidar com papéis, link, mudar papéis, desativar/reativar, redefinir autenticador, reenviar/copiar/cancelar convite; tabela → cards; travas de si mesmo e do último Administrador).
  Decisões: Administrador marcado envia só `ADMINISTRADOR` (os outros aparecem travados); o `me` do admin não recarrega no foco (a reconfiguração deixa o 2FA desligado por um instante); "Esqueceu a senha?" do admin só orienta a falar com um Administrador.
  Testado por HTTP (3399): configurar TOTP do `admin.um`, reconfigurar com senha errada/vazia/certa, outra sessão derrubada, barreira `TWO_FACTOR_SETUP_REQUIRED`, `TOTP_NOT_ENABLED`, segredo novo, log e alerta. Front: typecheck, `build` e `build:admin`; dev server do admin servindo. Telas não testadas no navegador.
  Para testar: `admin.um@iezer.local` ficou sem app (o login pede a configuração); para trocar a senha, `npm run user:create`. Convide um Suporte em Equipe, abra o link do log do back e confira o menu só com Minha conta.
  Pendências: criar o projeto na Vercel (mesmo repositório; Build `npm run build:admin`, Output `dist-admin`; o `vercel.json` serve aos dois) e pôr `ADMIN_WEB_ORIGIN` no Render com a URL; recuperação de senha da equipe (o link de redefinição aponta para o app das igrejas); Minha conta das igrejas ainda sem "Reconfigurar app".

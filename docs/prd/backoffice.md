# PRD — Back-office: operação interna do iEzer

Oct 14, 2026 · @Jeferson

## Contexto e objetivo

O back-office sai de dentro do app das igrejas e vira um app próprio da equipe iEzer. Nele a equipe cria e acompanha igrejas, atende pedidos de suporte e manda avisos às igrejas. Cobrança fica fora.

Estado atual, segundo o Registro das Sprints 6, 12 e 13 (o código não foi reconferido nesta rodada):

- O suporte vive em `/app/suporte`, dentro do app das igrejas, com rotas `/api/suporte/*`.
- O atendente é um `User` com `isSupportAgent`, sem atribuições e com 2FA obrigatório, criado pelo script `npm run suporte:agente`.
- O `SupportGrant` já cobre pedido pelo back-office e autorização pela igreja. O padrão é somente leitura, a escrita nunca alcança `/acesso` e `/organizacao`, as notas pastorais são sempre negadas (`config.denySupport`), o escopo é por módulos e só um grant fica ativo por vez. Também existem a emergência com segundo atendente e a recuperação de admin com verificação anotada.
- As leituras do suporte são gravadas como `suporte_ler` no `AuditLog`, e a Auditoria da igreja tem o filtro "Suporte iEzer".
- O script `igreja:criar` cria sede, congregações, responsável pela conta, perfis de fábrica e o convite do primeiro admin.
- O e-mail sai pelo Resend, ainda sem domínio: em homologação os e-mails vão para o log. A equipe do suporte ainda não recebe e-mails de aviso (pendência da Sprint 13).
- Não há produção. Tudo roda em homologação, só com dados fictícios. A homologação no navegador do MVP foi adiada, com o risco aceito de construir o back-office sobre telas ainda não testadas no navegador.

**Objetivo:** dar à equipe iEzer uma ferramenta própria, segura e auditada para implantar igrejas, resolver chamados sem ver mais dados do que o necessário e perceber problemas antes que a igreja reclame.

**Escopo:** app admin separado, contas e papéis da equipe, igrejas (criação, situação, congregações, contatos, troca do responsável, fim de contrato), o que a equipe vê e faz sem acesso aos dados, pedidos de acesso do suporte, painel de saúde, avisos em massa, auditoria interna e e-mails para a equipe.

Critérios de sucesso (a calibrar com a operação):

- Depois da primeira conta de Administrador iEzer, nenhuma igreja nem membro da equipe é criado por script.
- Nenhum dado de pessoa, lançamento financeiro ou nota pastoral aparece para a equipe sem um pedido de acesso aprovado.
- Toda ação da equipe aparece na auditoria interna e, quando toca uma igreja, também na Auditoria dessa igreja.
- Igreja sem admin, com um admin só ou parada em implantação aparece no painel de saúde sem que alguém precise procurar.
- No fim de contrato, a igreja recebe todos os seus dados num `.zip` sem a equipe abrir o arquivo.

## Personas

A equipe iEzer é pequena e cada pessoa acumula papéis. Do outro lado, a igreja precisa enxergar tudo o que a equipe fez na conta dela.

| Persona | O que precisa resolver | O que exige do back-office |
| --- | --- | --- |
| Administrador iEzer | Responder pela operação, gerir a equipe, aprovar emergências e acessos com escrita | Gestão da equipe, auditoria interna, e-mail a cada login da equipe, avisos em massa |
| Suporte | Resolver o chamado da igreja: login travado, admin perdido, problema nos dados | Ver o cadastro da igreja sem pedir acesso, ações de destravamento com motivo, pedido de acesso simples |
| Implantação | Pôr uma igreja nova no ar e acompanhar até ela ficar ativa | Criar igreja pela tela, editar congregações e contatos, reenviar o convite do primeiro admin |
| Responsável pela conta (igreja) | Ser reconhecido pelo iEzer e saber o que foi feito em nome da igreja | E-mail a cada ação da equipe sem pedido de acesso, troca documentada, link de exportação no fim do contrato |
| Admin da igreja | Saber o que o suporte viu e ser avisado de manutenção | Aprovação dos pedidos, filtro "Suporte iEzer" na Auditoria, faixa de avisos no app |

## Decisões

Sete decisões vêm do PRD de Acesso e quinze foram validadas nesta rodada. A B15 revê os prazos da A17.

### Herdadas do PRD de Acesso

- **A10:** no MVP, o time iEzer cria a igreja num back-office e convida o primeiro admin. O autosserviço com cobrança fica para depois.
- **A11:** o responsável pela conta é um contato da organização e só o iEzer o troca, mediante documento.
- **A17:** o suporte só vê dados com autorização de um admin da igreja, com prazo e motivo, somente leitura por padrão, nunca notas pastorais, tudo no log da igreja e revogável. Prazos revistos pela B15.
- **A18:** emergência sem autorização só com dupla aprovação interna e aviso imediato ao responsável pela conta.
- **A19:** sem personificação ("ver como usuário X").
- **RF-LP03:** o audit log é somente inclusão.
- **A22:** Better Auth para login, senha, 2FA e sessões; o resto em tabelas do iEzer.

### Validadas nesta rodada

| # | Decisão | Por quê |
| --- | --- | --- |
| B1 | App separado, com build e domínio próprios (`admin.<domínio>` quando houver domínio), saindo do repositório `iezer-front`, com o mesmo back e o mesmo login do Better Auth. Contas da equipe são exclusivas, nunca a conta de um usuário de igreja. `/app/suporte` sai do app das igrejas | Separa a ferramenta interna do produto e impede que uma conta de igreja chegue às telas da equipe |
| B2 | 2FA obrigatório só por app autenticador (código por e-mail não vale). Sessão encerra após 12 horas sem uso. E-mail ao Administrador iEzer em todo login da equipe | Uma conta da equipe alcança todas as igrejas |
| B3 | Três papéis internos fixos no código, sem tela de permissões: Administrador iEzer, Suporte e Implantação | Equipe pequena; menos configuração, menos erro |
| B4 | Criar igreja pela tela, substituindo o script: sede, CNPJ, congregações, responsável pela conta, encarregado de LGPD e primeiro admin (Pessoa e convite) | Implantação sem terminal |
| B5 | Situação da igreja: Implantação, Ativa, Suspensa ou Encerrada. Suspensa: ninguém entra e os dados ficam guardados. Encerrada: depois da eliminação definitiva registrada, a igreja continua na lista, sem dados e sem acesso | Dá um estado claro a cada conta |
| B6 | Fim de contrato: exportação completa em planilhas num `.zip` no MVP; eliminação definitiva como processo manual documentado | A trava de somente inclusão do audit log exige procedimento próprio |
| B7 | Troca do responsável com documento (tipo, data, número da ata) e anexo em PDF, JPG ou PNG de até 10 MB, guardado no Supabase Storage em bucket privado, acessado só pelo back com links assinados curtos. Retenção: contrato + 5 anos | Prova quem respondia pela igreja numa disputa; ata fotografada no celular é comum |
| B8 | Sem pedido de acesso, a equipe vê só o cadastro da igreja, os contatos da conta, a lista de usuários (nome, e-mail, perfis, status, último acesso) e contadores agregados | O iEzer é operador; vê o mínimo para atender |
| B9 | Ações sem pedido de acesso: reenviar convite de admin, redefinir 2FA de admin e destravar login bloqueado. Sempre com motivo, aviso ao responsável pela conta e registro na Auditoria da igreja | Resolve os chamados mais comuns sem abrir dados |
| B10 | Painel de saúde só com números e nomes de igrejas | Alerta a equipe sem expor pessoas |
| B11 | Auditoria interna de tudo o que a equipe fez, visível só ao Administrador iEzer; cada igreja continua vendo a sua parte no filtro "Suporte iEzer" | Controle de quem controla |
| B12 | E-mails para a equipe: pedido aprovado ou recusado, emergência aberta, igreja que ficou sem admin | Fecha a pendência da Sprint 13 |
| B13 | Avisos em massa: faixa no app e e-mail opcional aos admins e ao responsável pela conta; segmentação por todas, por situação ou escolhidas, e dentro da igreja todos ou só admins; início e fim obrigatórios; níveis informativo, manutenção e importante; só o Administrador iEzer publica; contagem de quem viu e dispensou | E-mail a todos os usuários sem domínio verificado cairia no spam e prejudicaria o remetente dos convites |
| B14 | Exportação de fim de contrato entregue por link de uso único no e-mail do responsável pela conta, válido por 7 dias, com o download registrado e o arquivo apagado ao fim do prazo. Notas pastorais vão num arquivo separado, só para quem tem a permissão de acessá-las | A equipe não manuseia os dados da igreja |
| B15 | Prazo do acesso do suporte conta a partir da aprovação da igreja: padrão de 24h, máximo de 72h. Pedido sem resposta expira em 7 dias. Pedido com escrita passa antes pelo Administrador iEzer, e ninguém aprova o próprio pedido | Meio-termo com o Customer Lockbox (máximo de 4h), que venceria antes de o suporte começar quando o pastor aprova à noite |

Ficam fora deste PRD, por decisão: cobrança, planos e autosserviço, e publicar nova versão dos termos pela tela (continua no código). Os avisos em massa ficam dentro.

## Conceitos do domínio

A equipe age sobre as igrejas-clientes em dois níveis: o que vê e faz sem acesso aos dados (cadastro, contadores e destravamento) e o que só faz com um pedido de acesso aprovado pela igreja.

### Situação da igreja

Toda igreja-cliente tem uma situação, que só a equipe muda e que vale para a sede e todas as congregações juntas.

&#91;embedded content: situação da igreja · 3 estados e o encerramento\]

A igreja nasce em Implantação, passa a Ativa quando tem admin e só vai para Suspensa por decisão do Administrador iEzer; o fim de contrato parte de Suspensa e, depois da eliminação registrada, a igreja vira Encerrada.

### O que a equipe vê

| Camada | O que mostra | Exige pedido de acesso? |
| --- | --- | --- |
| Cadastro | Dados da sede e das congregações, CNPJ, situação, responsável pela conta, encarregado de LGPD | Não |
| Usuários | Nome, e-mail, perfis por organização, status, último acesso, e-mail rejeitado | Não |
| Contadores | Pessoas cadastradas, usuários ativos, último uso | Não |
| Dados da igreja | Pessoas, famílias, acompanhamentos, financeiro e Auditoria detalhada, nos módulos do escopo | Sim |
| Notas pastorais | Anotações confidenciais | Nunca, nem com pedido |

### Vocabulário

- **Equipe iEzer:** quem trabalha no iEzer. Tem conta só no back-office, sem Pessoa e sem perfis de igreja.
- **Papel interno:** Administrador iEzer, Suporte ou Implantação. Fixo no código; uma pessoa pode ter mais de um, e as permissões se somam.
- **Igreja-cliente:** a sede e suas congregações, que contratam o iEzer juntas.
- **Pedido de acesso:** o `SupportGrant`. Libera a equipe a ver dados de uma igreja por um prazo, nos módulos do escopo.
- **Ação sem acesso aos dados:** reenviar convite, redefinir 2FA ou destravar login de um admin. Resolve o chamado sem abrir dados.
- **Aviso:** mensagem da equipe para as igrejas, mostrada numa faixa no topo do app.
- **Painel de saúde:** página inicial do back-office, com os alertas da operação por igreja.
- **Auditoria interna:** o registro de tudo o que a equipe fez, inclusive o que não toca uma igreja (logins, equipe, avisos).

## Requisitos funcionais

O back-office tem dez áreas: entrada, Equipe, Igrejas (lista, criação e detalhe), situação e fim de contrato, troca do responsável, ações sem acesso aos dados, Pedidos de acesso, Painel de saúde, Avisos e Auditoria interna. Todas seguem os padrões do app: tabela vira cards abaixo de `md`, skeleton espelha o layout real, formulários em `Dialog`/`FormField`, dados via React Query.

### Entrada da equipe

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO01 | App próprio em `admin.<domínio>` (URL da Vercel enquanto não houver domínio). Login por e-mail e senha seguido do código do app autenticador | MVP |
| RF-BO02 | Conta de igreja não entra no back-office: "Esta conta não tem acesso ao back-office do iEzer." Conta da equipe não entra no app das igrejas, exceto pelo modo suporte com pedido de acesso ativo (RF-BO38) | MVP |
| RF-BO03 | Primeiro acesso por convite (link de uso único, 72h): definir senha, configurar o app autenticador, guardar os 10 códigos de recuperação e aceitar o termo de confidencialidade da equipe | MVP |
| RF-BO04 | Menu e telas conforme os papéis do membro. O que o papel não permite não aparece, e o back recusa | MVP |
| RF-BO05 | Minha conta: trocar senha, reconfigurar o app autenticador, gerar novos códigos de recuperação, ver e encerrar sessões | MVP |

### Equipe (só Administrador iEzer)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO06 | Lista da equipe: nome, e-mail, papéis, status (convite pendente, ativo, desativado), 2FA configurado e último acesso | MVP |
| RF-BO07 | Convidar membro com nome, e-mail e um ou mais papéis. O e-mail não pode ser de usuário de igreja | MVP |
| RF-BO08 | Mudar papéis, desativar e reativar. Desativar derruba as sessões na hora | MVP |
| RF-BO09 | Redefinir o app autenticador de um membro: ele refaz a configuração no próximo login e recebe e-mail | MVP |
| RF-BO10 | Travas: ninguém muda os próprios papéis nem se desativa; o sistema bloqueia ficar sem Administrador iEzer ativo | MVP |

### Igrejas: lista e criação

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO11 | Lista de igrejas: sede, CNPJ, situação, número de congregações, responsável pela conta, usuários ativos e último uso. Busca por nome ou CNPJ e filtro por situação | MVP |
| RF-BO12 | "Nova igreja" pela tela, no lugar do script `igreja:criar`: nome da sede, CNPJ (`CpfCnpjInput` com CNPJ alfanumérico), congregações iniciais (opcional), responsável pela conta (nome, cargo, e-mail, telefone), encarregado de LGPD (opcional) e primeiro admin (nome e e-mail) | MVP |
| RF-BO13 | Ao salvar, numa transação: sede e congregações, contatos, seed dos perfis de fábrica e das listas da igreja, Pessoa do primeiro admin e convite com o perfil Pastor na sede. A igreja nasce em Implantação | MVP |
| RF-BO14 | CNPJ já cadastrado bloqueia com "Já existe uma igreja com este CNPJ" e link para ela. E-mail do primeiro admin que já é usuário em outra igreja é recusado (RF-CV08 de Acesso) | MVP |

### Igreja: detalhe

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO15 | Página da igreja com abas: Visão geral, Congregações, Usuários, Pedidos de acesso e Histórico (o que a equipe fez nela) | MVP |
| RF-BO16 | Visão geral: dados da sede, situação, responsável pela conta, encarregado de LGPD e os contadores (pessoas cadastradas, usuários ativos, último uso) | MVP |
| RF-BO17 | Editar dados da sede e das congregações (criar, editar, desativar) e os contatos da conta. Congregação com dados não pode ser apagada (RF-OR01 de Acesso) | MVP |
| RF-BO18 | Aba Usuários: nome, e-mail, perfis por organização, status, último acesso e marca de e-mail rejeitado. Sem link para a Pessoa e sem nenhum outro dado dela | MVP |

### Situação e fim de contrato

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO19 | "Marcar como ativa", de Implantação para Ativa, liberado só quando a igreja tem pelo menos um admin ativo | MVP |
| RF-BO20 | "Suspender", com motivo: as sessões da igreja caem e quem tenta entrar vê "O acesso da sua igreja está suspenso. Fale com o responsável pela conta." O responsável pela conta e os admins recebem e-mail | MVP |
| RF-BO21 | "Reativar" uma igreja suspensa, com motivo, e aviso por e-mail ao responsável pela conta | MVP |
| RF-BO22 | "Exportar dados": gera um `.zip` com uma planilha por conjunto (pessoas, famílias, ciclo de vida e acompanhamentos, contribuições, contas a pagar e a receber, cadastros financeiros, usuários e perfis, Auditoria da igreja). A equipe dispara, mas não baixa | MVP |
| RF-BO23 | O responsável pela conta recebe por e-mail um link de uso único, válido por 7 dias. O download fica registrado. O arquivo é apagado quando o prazo acaba; se não foi baixado, a exportação pode ser gerada de novo. Notas pastorais, quando existirem (F2 de Pessoas), vão num arquivo separado, enviado só a quem tem "Acessar notas pastorais", com o mesmo link de uso único de 7 dias | MVP |
| RF-BO24 | Eliminação definitiva fora da tela, por roteiro documentado com dupla checagem. O back-office registra quando foi feita, por quem e com qual documento, e a igreja passa para Encerrada | MVP (processo) |

### Troca do responsável pela conta

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO25 | Trocar o responsável pela conta exige o documento: tipo (ata, procuração, outro), data, número da ata quando houver e o anexo em PDF, JPG ou PNG de até 10 MB | MVP |
| RF-BO26 | O responsável anterior, o novo e os admins da igreja recebem e-mail da troca, que entra na Auditoria da igreja | MVP |
| RF-BO27 | Histórico de responsáveis com os documentos. Abrir um anexo gera um link assinado de 5 minutos, e cada abertura é registrada | MVP |
| RF-BO28 | Cada documento guarda a data de descarte (fim do contrato + 5 anos); uma rotina apaga os vencidos | MVP (data); F2 (rotina) |

### Ações sem acesso aos dados

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO29 | Reenviar o convite de um admin da igreja, inclusive o do primeiro admin | MVP |
| RF-BO30 | Redefinir o 2FA de um admin da igreja, com a verificação de identidade anotada (documento e contato cadastrado), como na recuperação de admin | MVP |
| RF-BO31 | Destravar um login bloqueado por tentativas erradas | MVP |
| RF-BO32 | Toda ação desta área pede motivo e, opcionalmente, o número do chamado. O responsável pela conta recebe e-mail e a ação entra na Auditoria da igreja como "Suporte iEzer" | MVP |
| RF-BO33 | Recuperação de admin (RF-SP10 de Acesso) migra para o back-office sem mudar as regras | MVP |

### Pedidos de acesso do suporte

&#91;embedded content: pedido de acesso do suporte · aprovações e prazos\]

Pedido com escrita passa pelo Administrador iEzer antes de chegar à igreja; o relógio do acesso só corre depois do sim da igreja.

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO34 | Novo pedido: igreja, motivo, número do chamado, módulos do escopo, somente leitura ou escrita (escrita exige justificativa) e duração (padrão de 24h, máximo de 72h). O papel Implantação só pede somente leitura e só para igreja em Implantação | MVP |
| RF-BO35 | Pedido com escrita vai primeiro ao Administrador iEzer e só depois à igreja. Ninguém aprova o próprio pedido | MVP |
| RF-BO36 | O prazo começa quando a igreja aprova. Pedido sem resposta da igreja expira em 7 dias | MVP |
| RF-BO37 | Lista de pedidos por status: aguardando iEzer, aguardando igreja, ativo, expirado, recusado, revogado e encerrado. Continua valendo um pedido ativo por vez | MVP |
| RF-BO38 | Com o pedido ativo, "Abrir no modo suporte" abre o app das igrejas só nos módulos do escopo, com uma faixa fixa "Suporte iEzer · somente leitura · até dd/mm, hh:mm" | MVP |
| RF-BO39 | Emergência (incidente, ordem judicial, igreja sem admin): qualquer papel com Suporte abre, com motivo; um Administrador iEzer diferente aprova; prazo máximo de 24h; aviso imediato ao responsável pela conta e aos admins; só o iEzer encerra | MVP |
| RF-BO40 | Encerrar o pedido antes do prazo pelo back-office, sem esperar a igreja revogar | MVP |

### Painel de saúde (página inicial)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO41 | Cartões com a contagem e os nomes das igrejas em cada alerta: sem admin; com um admin só; em Implantação há mais de 15 dias; com e-mails rejeitados nos últimos 7 dias; com login bloqueado agora; sem nenhum acesso há 30 dias; com pedido de acesso pendente | MVP |
| RF-BO42 | Clicar numa igreja abre a página dela. O painel nunca mostra nome de pessoa: o e-mail rejeitado aparece marcado na aba Usuários da igreja | MVP |
| RF-BO43 | Os prazos dos alertas (15, 7 e 30 dias) ficam em parâmetros no código | MVP |

### Avisos em massa (só Administrador iEzer)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO44 | Novo aviso: título, texto curto com link opcional, nível (informativo, manutenção ou importante), início e fim obrigatórios | MVP |
| RF-BO45 | Público: todas as igrejas, por situação (Implantação, Ativa) ou escolhidas uma a uma; dentro da igreja, todos os usuários ou só os admins. Igrejas suspensas e encerradas ficam de fora | MVP |
| RF-BO46 | Opção de e-mail aos admins e ao responsável pela conta, enviado quando o aviso entra no ar | MVP |
| RF-BO47 | No app das igrejas, a faixa aparece acima do header. Informativo e manutenção podem ser dispensados; o importante fica até o fim. Com vários no ar, o de nível mais alto vem primeiro | MVP |
| RF-BO48 | Status do aviso: rascunho, agendado, no ar e encerrado. Editar até entrar no ar; encerrar antes do fim | MVP |
| RF-BO49 | Cada aviso mostra quantos usuários viram e quantos dispensaram. Não há confirmação de leitura obrigatória | MVP |
| RF-BO50 | E-mail do aviso a todos os usuários das igrejas, depois do domínio verificado | F2 |

### Auditoria interna e e-mails da equipe

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO51 | Tela Auditoria, só para o Administrador iEzer: tudo o que a equipe fez em todas as igrejas e fora delas (logins, equipe, avisos), com filtros por membro, igreja, ação e período | MVP |
| RF-BO52 | Toda ação da equipe sobre uma igreja também entra na Auditoria dessa igreja, no filtro "Suporte iEzer" | MVP |
| RF-BO53 | Exportar a auditoria interna, com a exportação registrada no próprio log | F2 |
| RF-BO54 | E-mails para a equipe: pedido aprovado ou recusado (a quem pediu), emergência aberta (aos Administradores iEzer), igreja que ficou sem admin (a Suporte e Administradores) | MVP |
| RF-BO55 | E-mail a todos os Administradores iEzer a cada login da equipe, com nome, data e hora, navegador e local aproximado | MVP |

## Papéis internos e permissões

Os três papéis são fixos no código e se somam: quem é Suporte e Implantação faz o que os dois fazem. O Administrador iEzer faz tudo.

| Ação | Administrador iEzer | Suporte | Implantação |
| --- | --- | --- | --- |
| Ver o painel de saúde | Sim | Sim | Sim |
| Ver lista e cadastro das igrejas, contatos, usuários e contadores | Sim | Sim | Sim |
| Criar igreja | Sim | Não | Sim |
| Editar sede, congregações e contatos da conta | Sim | Não | Sim |
| Trocar o responsável pela conta (com documento) | Sim | Não | Sim |
| Marcar igreja como ativa | Sim | Não | Sim |
| Suspender e reativar igreja | Sim | Não | Não |
| Gerar a exportação de fim de contrato | Sim | Não | Não |
| Registrar a eliminação definitiva | Sim | Não | Não |
| Reenviar convite de admin | Sim | Sim | Sim |
| Redefinir 2FA de admin e destravar login | Sim | Sim | Não |
| Recuperação de admin | Sim | Sim | Não |
| Pedir acesso somente leitura | Sim | Sim | Sim, só com a igreja em Implantação |
| Pedir acesso com escrita | Sim | Sim | Não |
| Aprovar pedido com escrita e emergência (nunca o próprio) | Sim | Não | Não |
| Abrir emergência | Sim | Sim | Não |
| Publicar avisos em massa | Sim | Não | Não |
| Gerir a equipe | Sim | Não | Não |
| Ver a auditoria interna | Sim | Não | Não |

O back confere o papel em toda rota; o front só esconde o que o papel não alcança.

## Segurança da equipe

Uma conta da equipe alcança todas as igrejas, por isso as regras são mais duras que as do app das igrejas: só app autenticador, sessão curta e aviso a cada login.

| Item | Regra | Fase |
| --- | --- | --- |
| Senha | As mesmas regras do PRD de Acesso: mínimo de 12 caracteres, recusa de senhas vazadas e comuns, sem expiração | MVP |
| 2FA | Obrigatório desde o primeiro acesso, só por app autenticador (TOTP). Código por e-mail não vale. 10 códigos de recuperação de uso único | MVP |
| Sessão | Encerra após 12 horas sem uso. Desativar, trocar a senha ou redefinir o 2FA derrubam as sessões na hora | MVP |
| Tentativas | Bloqueio após 5 erros seguidos, como no Acesso, com aviso aos Administradores iEzer | MVP |
| Alerta de login | E-mail a todos os Administradores iEzer a cada login da equipe (RF-BO55) | MVP |
| Contas exclusivas | O e-mail de uma conta da equipe não pode ser de usuário de igreja, e vice-versa. A sessão do back-office não vale no app das igrejas, exceto no modo suporte | MVP |
| Buscadores | O app admin não é indexado (`noindex`) e não tem link a partir do app das igrejas | MVP |
| Termo | Termo de confidencialidade da equipe aceito no primeiro acesso, com versão no log | MVP |
| Revisão de acessos | A cada trimestre, o Administrador iEzer confere quem está na equipe e com quais papéis | MVP (processo) |
| Restrição por IP | Login aceito só a partir de endereços de internet autorizados (VPN ou escritório) | F2 |

## Privacidade, LGPD e auditoria

A igreja é a controladora e o iEzer é o operador (LGPD, art. 39). O back-office é onde o operador mais poderia ver, por isso mostra o mínimo sem autorização e registra tudo o que a equipe faz.

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-BO56 | Nenhuma tela do back-office, nem o painel, mostra pessoas, contribuições, lançamentos ou a Auditoria detalhada da igreja sem um pedido de acesso ativo (B8) | MVP |
| RF-BO57 | Arquivos no Supabase Storage em bucket privado, acessados só pelo back. Links assinados de 5 minutos, cada abertura registrada. Tipos aceitos: PDF, JPG e PNG, até 10 MB | MVP |
| RF-BO58 | Retenção: documento de troca do responsável durante o contrato e por mais 5 anos; `.zip` de exportação apagado em 7 dias | MVP |
| RF-BO59 | A exportação é gerada pelo sistema e entregue só ao responsável pela conta; as notas pastorais, só a quem tem a permissão de acessá-las. A equipe nunca baixa o arquivo, e o download fica na Auditoria da igreja | MVP |
| RF-BO60 | Roteiro de eliminação definitiva: o que apagar (dados, arquivos no Storage), quando os backups expiram, como tratar a trava de somente inclusão do audit log e qual comprovante a igreja recebe. O registro da eliminação é guardado | MVP (processo) |
| RF-BO61 | A auditoria interna segue a mesma garantia do audit log das igrejas: gravada na mesma transação da ação e somente inclusão | MVP |
| RF-BO62 | Registro de incidentes na tela, guardado por 5 anos (RF-LP09 de Acesso) | F2 |

Os prazos de retenção e o roteiro de eliminação precisam ser validados com o jurídico antes da primeira igreja real.

## Requisitos técnicos

O back-office usa o mesmo back (Fastify, Prisma, Postgres no Supabase, Render) e o mesmo Better Auth. O que muda é um segundo front e uma camada de rotas própria da equipe.

### Back

| ID | Requisito |
| --- | --- |
| RT-BB01 | Rotas da equipe em `/api/admin/*` (substituem `/api/suporte/*`), aceitas só com sessão de conta da equipe. Checagem por papel em cada rota (`requireTeamRole('suporte')`), nunca pelo que o front diz |
| RT-BB02 | Entidade `TeamMember`: `userId` único, papéis, status, quem convidou, aceite do termo. O `User` da equipe não tem `personId` nem `UserAssignment`, então `User.personId` passa a aceitar nulo só para contas da equipe. `GET /api/admin/me` devolve membro e papéis |
| RT-BB03 | Regras da equipe no Better Auth, por hooks e middleware do iEzer: 2FA só TOTP (OTP por e-mail recusado para conta da equipe), sessão revogada após 12h sem uso, bloqueio após 5 erros. `trustedOrigins` com os dois fronts; o back recusa sessão da equipe vinda do app das igrejas fora do modo suporte e sessão de igreja nas rotas `/api/admin/*` |
| RT-BB04 | `Organization.status` (IMPLANTACAO, ATIVA, SUSPENSA, ENCERRADA) na sede, com data e motivo da última mudança. A checagem de sessão do app das igrejas recusa usuário de igreja suspensa ou encerrada com um código próprio |
| RT-BB05 | Criação de igreja num serviço único, usado pela tela e por testes. O script `igreja:criar` é removido. Tudo numa transação |
| RT-BB06 | Supabase Storage: bucket privado, upload só pelo back (limite de 10 MB, tipo conferido pelo conteúdo, não pela extensão), caminho por organização, links assinados de 5 minutos. `AccountDocument` guarda tipo, data, número da ata, arquivo e data de descarte |
| RT-BB07 | Exportação como tarefa em segundo plano: uma planilha por conjunto, compactadas num `.zip` enviado ao Storage. Token de download aleatório, guardado como hash, de uso único e válido por 7 dias. Rotina diária apaga os arquivos vencidos |
| RT-BB08 | Webhook do Resend em rota pública com verificação de assinatura; grava `EmailEvent` (tipo, e-mail, organização, data) para os alertas de e-mail rejeitado. Só funciona de verdade depois do domínio verificado |
| RT-BB09 | Painel de saúde por consultas agregadas por igreja, que nunca devolvem dados de pessoa; cache de poucos minutos |
| RT-BB10 | `Announcement` (título, texto, link, nível, início, fim, público, igrejas-alvo, envio de e-mail, autor, status) e `AnnouncementView` (usuário, aviso, visto em, dispensado em). `GET /me/avisos` no app das igrejas devolve só os avisos no ar para aquele usuário |
| RT-BB11 | `SupportGrant` ganha aprovação interna (quem e quando), início do prazo na aprovação da igreja, padrão de 24h e máximo de 72h, expiração do pedido em 7 dias e trava de autor diferente do aprovador |
| RT-BB12 | Ação da equipe sobre uma igreja grava no `AuditLog` com tipo de autor suporte e a organização; ação sem igreja (login, equipe, avisos) grava com organização nula e só aparece na auditoria interna. A trava de `UPDATE`/`DELETE` (RT-AB10 de Acesso) vale para as duas |
| RT-BB13 | E-mails da equipe com modelos e destinatários por papel. Em homologação continuam indo para o log |
| RT-BB14 | Rotinas agendadas no Render: expirar pedidos, apagar exportações vencidas, recalcular o painel. Antes de criar, conferir quais já existem |

### Front

| ID | Requisito |
| --- | --- |
| RT-BF01 | Segundo app no repositório `iezer-front`, com build e projeto próprios na Vercel. Reaproveita `ui/*`, os campos padronizados (`DatePicker`, `CpfCnpjInput`, `PhoneInput`, `Select`) e os padrões do `CLAUDE.md`, sem importar telas do app das igrejas |
| RT-BF02 | Rotas: `/login`, `/convite/:token`, `/` (painel), `/igrejas`, `/igrejas/nova`, `/igrejas/:id`, `/pedidos`, `/avisos`, `/equipe`, `/auditoria`, `/minha-conta` |
| RT-BF03 | `queryKeys` próprios do admin; `useTeamRole` e `<CanTeam>` lendo `GET /api/admin/me` |
| RT-BF04 | O app das igrejas perde `/app/suporte` e ganha a faixa de avisos acima do header, a tela de igreja suspensa e a faixa fixa do modo suporte |
| RT-BF05 | Componente novo `FileUpload` (PDF, JPG e PNG, 10 MB, com progresso e erro claro). Passa pelo checklist da CLI (border sem cor, `bg-background`, `!classe`, `[--var]`, `duration-0`) |
| RT-BF06 | Título, favicon e cor de destaque diferentes do app das igrejas, para ninguém confundir os dois. `meta robots` com `noindex` |
| RT-BF07 | Telas de Igrejas, Equipe, Pedidos, Avisos e Auditoria seguem o padrão tabela → cards abaixo de `md`, com skeleton espelhando o layout |

## Migração do que já existe

Como não há produção e os dados são fictícios, a migração troca as peças de uma vez, sem período de convivência.

| Hoje | Vira |
| --- | --- |
| `/app/suporte` dentro do app das igrejas | Removido; as telas passam para o app admin |
| Rotas `/api/suporte/*` | `/api/admin/*`, com checagem por papel interno |
| `User.isSupportAgent` | `TeamMember` com o papel Suporte; o campo sai |
| Script `npm run suporte:agente` | Usado uma única vez para criar o primeiro Administrador iEzer; os demais entram por convite na tela |
| Script `igreja:criar` | Tela "Nova igreja" sobre o mesmo serviço; script removido |
| `Organization` sem situação | Situação Ativa para as igrejas fictícias que já existem |
| `SupportGrant` com 72h padrão e 7 dias máximo | 24h padrão e 72h máximo, prazo a partir da aprovação; grants abertos em homologação são encerrados |
| Equipe sem e-mail de aviso (pendência da Sprint 13) | E-mails da equipe (RF-BO54 e RF-BO55) |
| Leituras do suporte como `suporte_ler` | Mantido; as ações novas ganham nomes próprios no `AuditLog` |
| A17 e RF-SP02 do PRD de Acesso com os prazos antigos | Atualizados com a B15 |

## Recorte por fase

O MVP tira toda a operação do terminal e do app das igrejas; a F2 traz o que depende de domínio próprio ou de mais maturidade da operação.

| Fase | Entrega |
| --- | --- |
| MVP | App admin separado; equipe com papéis, 2FA por app, sessão de 12h e e-mail a cada login; lista, criação e detalhe das igrejas; situação Implantação, Ativa, Suspensa e Encerrada; exportação de fim de contrato; troca do responsável com documento; ações sem acesso aos dados; pedidos de acesso com os novos prazos e modo suporte; painel de saúde; avisos em massa por faixa e e-mail aos admins; auditoria interna; e-mails da equipe |
| F2 | E-mail de aviso a todos os usuários; restrição por IP; exportação da auditoria interna; rotina que apaga documentos vencidos; registro de incidentes na tela |
| Fora | Cobrança, planos e autosserviço (PRD próprio); publicar termos pela tela |

A fase de cada requisito está na coluna Fase das tabelas de requisitos funcionais.

## Dependências

O back-office não depende de nenhum PRD novo para começar; o que mais pesa é o domínio, que libera os e-mails reais e o alerta de e-mails rejeitados.

| Item | Relação | O que envolve | Bloqueia o MVP? |
| --- | --- | --- | --- |
| PRD de Acesso | Base | Better Auth, `SupportGrant`, `AuditLog`, convites; A17 e RF-SP02 atualizados com a B15 | Não, já entregue |
| PRD de Pessoas | Afetado | Criar igreja cria a Pessoa do primeiro admin; a exportação inclui pessoas, famílias e acompanhamentos | Não |
| Financeiro | Afetado | A exportação inclui contribuições, contas e cadastros financeiros | Não |
| Domínio do iEzer | Externo | `admin.<domínio>`, SPF e DKIM no Resend, webhook de e-mails rejeitados | Não para construir; sim para e-mails reais e o alerta de rejeição |
| Supabase Storage | Infra | Bucket privado para documentos e exportações | Não |
| Homologação no navegador do MVP | Risco aceito | O back-office é construído sobre telas ainda não testadas no navegador | Não |

## Fora de escopo e validações

Fora de escopo deste PRD: cobrança, planos e autosserviço; publicar nova versão dos termos pela tela; personificação de usuários; restrição por IP no MVP; e-mail de aviso a todos os usuários no MVP; qualquer acesso da equipe a notas pastorais.

A validar com a operação e com o jurídico:

- **Tamanho da equipe no lançamento.** Três pessoas no início, o que garante um segundo aprovador. Como ninguém aprova o próprio pedido, pelo menos dois membros precisam ter o papel Administrador iEzer, para que um aprove a escrita ou a emergência aberta pelo outro. Confirmar quem fica com cada papel.
- **Restrição por IP fora do MVP.** Confirmado: no MVP basta a combinação de app autenticador, sessão de 12h e e-mail a cada login; a restrição fica para a F2.
- **Entrar com Google no back-office.** Confirmado: o back-office não oferece login pelo Google, só e-mail e senha com app autenticador.
- **Implantação pedindo acesso.** Confirmado: Implantação pede acesso somente leitura, e só enquanto a igreja está em Implantação.
- **Notas pastorais na exportação.** Confirmado: ficam fora do arquivo principal e vão num arquivo separado, só para quem tem a permissão de acessá-las. Valem a partir da F2 de Pessoas, quando as notas existirem; não entram no `.zip`.
- **Depois da eliminação.** Confirmado: a igreja ganha a situação Encerrada.
- **Modo suporte.** Conferir como o atendente vê os dados hoje com o grant ativo (Sprint 12) antes de desenhar o RF-BO38.
- **Prazos do painel.** Confirmados: 15 dias em implantação, 7 dias de e-mail rejeitado e 30 dias sem acesso.
- **Retenção.** Confirmado: contrato + 5 anos para o documento do responsável. Falta levantar o prazo de backups do Supabase para o roteiro de eliminação.

### Fontes

- [PRD — Pessoas: cadastro e gestão de pessoas](https://claude.ai/code/artifact/07546a99-1aac-4672-b841-7f75d810b7fe)
- [PRD — Acesso: autenticação, usuários, perfis e permissões](https://claude.ai/code/artifact/e2c74247-820b-45ab-95b2-6fedde879841)
- [Microsoft: Customer Lockbox](https://learn.microsoft.com/en-us/training/modules/audit-identity-access-management/customer-lockbox)
- [Opal: segurança de ferramentas internas](https://www.opal.dev/blog/internal-admin-tools)
- [Resend: webhooks](https://resend.com/docs/webhooks)

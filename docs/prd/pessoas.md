# PRD — Pessoas: cadastro e gestão de pessoas

> Exportado do Doc em 09/10/2026. O Doc no claude.ai é a fonte de verdade; esta cópia é para o Claude Code ler. Data original: 28/09/2026.


## Contexto e objetivo

O cadastro de pessoas sai de Operação › Cadastro › Membros e passa a ser criado e gerido no tópico **Pessoas**, como o registro central de todos que se relacionam com a igreja.

Hoje existe um CRUD simples de `Member`, nascido com foco financeiro. Ele lista tudo sem paginação, guarda a célula como texto livre, faz exclusão física e não tem controle de acesso real. A igreja piloto tem centenas de pessoas, e o produto precisa estar pronto para milhares.

**Objetivo:** permitir que secretaria, tesouraria e pastor cadastrem, encontrem e acompanhem cada pessoa, do primeiro contato como visitante até a membresia e a saída, com dados confiáveis, sem duplicidade e em conformidade com a LGPD.

**Escopo deste PRD:** listagem, cadastro rápido, perfil da pessoa, família básica, ciclo de vida, acompanhamento, indicadores da jornada no Painel, importação pela planilha modelo, permissões do módulo e migração do modelo atual.

**Critérios de sucesso (a calibrar com a igreja piloto):**

- A base da igreja piloto entra pela planilha modelo sem redigitação manual no sistema.
- O cadastro rápido não gera pessoas duplicadas por CPF, email ou celular.
- O funil visitante → novo convertido → congregado → membro é mensurável pela linha do tempo.
- Nenhum acesso a notas pastorais acontece fora do perfil autorizado, e todo acesso fica no audit log.

## Personas

A secretaria é a usuária principal; o pastor é quem mais depende da visão de acompanhamento; a tesouraria precisa da pessoa certa para vincular contribuições.

| Persona | O que precisa resolver | O que exige da tela |
| --- | --- | --- |
| Secretaria | Cadastrar visitante na recepção, manter dados em dia, importar a base, registrar entradas e saídas | Cadastro rápido, detecção de duplicado, importação, ações de ciclo de vida, busca eficiente |
| Pastor | Saber quem é a pessoa, em que estágio está e o que foi conversado com ela | Perfil com visão geral no topo, linha do tempo, notas pastorais restritas, filtros por estágio |
| Tesouraria | Vincular dízimos e ofertas à pessoa certa e consultar o histórico dela | Seletor de pessoa com busca, aba de contribuições no perfil |
| Admin da igreja | Definir o que cada perfil de acesso pode fazer | Tela de perfis e permissões com nomes amigáveis |
| Líder de célula (futuro) | Ver os membros da própria célula e o contato deles | Permissão com escopo de célula (PRD de Células) |
| A própria pessoa (futuro) | Preencher e atualizar a própria ficha | Autocadastro com controle por campo (fora do MVP) |

Do ponto de vista do cliente (a igreja que contrata), três coisas pesam: migrar a base sem sofrimento, estar coberto na LGPD e enxergar o crescimento da igreja.

## Decisões

Quinze decisões estão fechadas e orientam todos os requisitos abaixo.

| # | Decisão | Por quê |
| --- | --- | --- |
| D1 | Entidade única `Person`. `User` é um acesso opcional ligado a ela (1 pessoa : 0..1 conta). Todo módulo que se refere a alguém (Financeiro, Células, Kids, Relatórios) aponta para `Person`; nenhum cria cadastro próprio de pessoa | Uma mesma pessoa pode ser membro, líder e tesoureira. Evita cadastros paralelos de nome e email |
| D2 | Vínculo e situação são campos separados | "Membro inativo" e "visitante ativo" são combinações reais |
| D3 | Vínculo em 4 estágios: Visitante, Novo convertido, Congregado, Membro. Mais um 5º estágio opcional, Membro em formação, que cada igreja liga e pode renomear | "Frequentador" e "congregado" são a mesma coisa; novo convertido é um estágio próprio; muitas igrejas recebem crianças apresentadas ou batizadas como membros em formação |
| D4 | Listas eclesiásticas configuráveis por organização, com padrão evangélico de fábrica | O público são igrejas evangélicas de várias tradições, com formas de admissão e cargos diferentes |
| D5 | Perfil da pessoa como página (hub), com edição por seção em modal. Criação por modal de cadastro rápido | O cadastro inteiro não cabe no `max-w-lg`, mas cada seção cabe. Reaproveita `Dialog`/`DialogBody`/`FormField` |
| D6 | Sem exclusão física de pessoa com histórico. Saída por mudança de situação; anonimização LGPD como operação separada | Hoje excluir deixa os recebíveis órfãos |
| D7 | Uma congregação de rol por pessoa; `organizationId` desde o primeiro dia | Adicionar organização depois exige migrar todas as tabelas |
| D8 | O item Membros sai de Operação › Cadastro; a rota antiga redireciona para `/app/pessoas` | Criação e gestão ficam só em Pessoas |
| D9 | A entrada inicial da base é pela planilha modelo gerada pelo iEzer. As fichas em papel são passadas para a planilha pela igreja | Um único caminho de entrada em lote, com validação e detecção de duplicados |
| D10 | Permissões configuráveis: o admin marca as permissões de cada perfil de acesso. Nomes amigáveis na interface e travas de segurança | Cada igreja organiza a secretaria e a tesouraria de um jeito |
| D11 | Sem campo "nome social". Um campo "Como prefere ser chamado" para todos, e obrigatoriedade de dados que cresce com o vínculo | Cobre o uso prático sem a carga do termo, e não cria campo que some quando a pessoa muda de estágio |
| D12 | Crianças são Pessoas desde o MVP, com responsável obrigatório e consentimento dado por ele. Check-in, autorização de retirada e regras do ministério infantil ficam no PRD de Kids | A criança é a mesma pessoa ao longo da vida na igreja; muitas igrejas controlam por família |
| D13 | Vocabulário separado: "Desligado do rol" ≠ "Apagar registro"; "Cargo eclesiástico" ≠ "Perfil de acesso" | Na igreja, "exclusão" é disciplinar e "cargo" é função ministerial. Misturar com os termos do sistema causa erro grave |
| D14 | Perfis de fábrica separados por função: Tesoureiro vê pessoas e contribuições; Secretário cuida do cadastro e do ciclo eclesiástico; Pastor tem acesso total | Financeiro e ciclo eclesiástico são responsabilidades distintas, como pediu o pastor da igreja piloto |
| D15 | Acompanhamento é um registro próprio (data, tipo, autor, observação curta), separado das notas pastorais | Torna mensurável o cuidado com visitantes e novos convertidos e alimenta os indicadores do Painel |

## Conceitos do domínio

Toda pessoa tem um **vínculo** (em que estágio da caminhada está) e uma **situação** (se está ativa no rol), e os dois mudam por ações registradas na linha do tempo.

Diagrama no Doc, transcrito:

- Vínculo (trilha): Visitante → Novo convertido → Congregado → Membro. Mais o estágio opcional Membro em formação. É possível pular estágios.
- Situação (independente do vínculo): Ativo → Inativo, Transferido, Desligado do rol ou Falecido, sempre por uma ação registrada; Reativar volta para Ativo.

O vínculo é uma trilha de estágios; a situação é independente e sai de Ativo por uma ação registrada.

### Vínculo e dados mínimos por estágio

A obrigatoriedade cresce com o vínculo. A ação de promover abre um modal pedindo só o que falta para o novo estágio. É possível pular estágios (ex.: quem chega por transferência vira membro direto).

| Vínculo | Significado | Mínimo obrigatório |
| --- | --- | --- |
| Visitante | Veio à igreja e deixou contato | Um nome (pode ser só o primeiro) + um contato |
| Novo convertido | Fez decisão de fé e está em acompanhamento | Nome completo + data de conversão |
| Congregado | Frequenta com regularidade, sem ser membro | Nome completo |
| Membro | Faz parte do rol da igreja | Nome completo + forma e data de admissão |
| Membro em formação (opcional) | Criança apresentada ou batizada, recebida em formação até a profissão de fé. Cada igreja liga o estágio e pode renomeá-lo (ex.: "membro não comungante") | Nome completo + data de nascimento + responsável vinculado |

Qualquer pessoa menor de 18 anos, em qualquer estágio, exige pelo menos um responsável vinculado e o consentimento dado por ele.

### Situação

A situação não é um campo editável: muda só por ações do menu do perfil, que pedem data e motivo.

| Situação | Como entra | Dados pedidos | Efeito |
| --- | --- | --- | --- |
| Ativo | Padrão ou reativação | Data | Aparece nas listas e na mensageria |
| Inativo | Ação "Inativar" | Motivo (lista configurável) | Sai das listas padrão e da mensageria |
| Transferido | Ação "Transferir" | Data, igreja de destino, carta emitida? | Se o destino for outra congregação no iEzer, vira transferência interna: muda a congregação e mantém o histórico |
| Desligado do rol | Ação "Desligar do rol" | Motivo (a pedido, abandono, disciplinar…) | Igual a Inativo |
| Falecido | Ação "Registrar falecimento" | Data | Sai de aniversariantes e comunicação; continua nos relatórios históricos |

### Nomes

| Onde aparece | Nome usado |
| --- | --- |
| Listagem, perfil, mensagens, aniversariantes | "Como prefere ser chamado" (se preenchido), com o nome completo ao lado |
| Recibos, carta de transferência, carteirinha, certificados, exportação | Nome completo civil |

### Vocabulário

- **Congregação de rol:** a única organização à qual a pessoa pertence. Mudar de congregação é um evento de transferência interna.
- **Família:** grupo de pessoas de um mesmo domicílio, com papéis (responsável, cônjuge, filho, outro) e endereço que pode ser compartilhado.
- **Acompanhamento:** registro de um contato de cuidado com a pessoa (ligação, visita, mensagem, conversa), com data, autor e observação curta. Não é confidencial e não substitui as notas pastorais.
- **Cargo eclesiástico:** função na igreja (diácono, presbítero, evangelista). Vive no perfil da pessoa e não dá acesso ao sistema.
- **Perfil de acesso:** conjunto de permissões de um usuário do sistema (Pastor, Tesoureiro, Secretário). Vive em Configurações.
- **Apagar registro:** remoção técnica de um cadastro feito por engano, sem vínculos. Nunca é usada para registrar saída do rol.

## Requisitos funcionais

O módulo tem quatro superfícies: listagem, cadastro rápido, perfil da pessoa e importação. Todas seguem os padrões do app: tabela vira cards abaixo de `md`, skeleton espelha o layout real, dados via React Query.

### Listagem (`/app/pessoas`)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-L01 | Paginação, busca e filtros no servidor. Busca por nome, apelido, CPF, telefone e email, com debounce | MVP |
| RF-L02 | Filtros: vínculo, situação, congregação, faixa etária, sexo, aniversariantes do mês, batizado (sim/não), família, sem contato | MVP |
| RF-L03 | Atalhos de visão: Todos, Membros, Visitantes, Novos convertidos, Aniversariantes | MVP |
| RF-L04 | Colunas no desktop: Pessoa (iniciais + nome + idade), Vínculo, Situação, Congregação, Contato, Ações. Ordenação por nome, data de cadastro e nascimento | MVP |
| RF-L05 | Cards no mobile com as mesmas ações da linha. Filtros num `Sheet` no mobile | MVP |
| RF-L06 | Clicar na linha ou no card abre o perfil | MVP |
| RF-L07 | Estado vazio com dois CTAs: "Cadastrar pessoa" e "Importar planilha" | MVP |
| RF-L08 | Exportação CSV do resultado filtrado, sujeita à permissão e registrada no log | F2 |
| RF-L09 | Ações em lote: mudar situação, atribuir congregação, exportar | F2 |
| RF-L10 | Contadores no topo: ativos, visitantes nos últimos 30 dias, aniversariantes da semana | F2 |

### Cadastro rápido (modal)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-C01 | Campos: nome, celular com marcação "é WhatsApp", vínculo, congregação; email e nascimento opcionais. Obrigatoriedade conforme o vínculo escolhido | MVP |
| RF-C02 | Detecção de duplicado durante a digitação: CPF igual bloqueia e oferece abrir o perfil; email ou celular igual avisa; nome parecido + mesma data de nascimento avisa | MVP |
| RF-C03 | Footer com "Salvar" e "Salvar e completar perfil" (leva para a página da pessoa) | MVP |
| RF-C04 | Data de nascimento que indique menor de 18 anos exige vincular pelo menos um responsável (pessoa já cadastrada ou cadastrada na hora) e registrar o consentimento dado por ele | MVP |

### Perfil da pessoa (`/app/pessoas/:id`)

O cabeçalho fixo mostra iniciais ou foto, nome e apelido, badges de vínculo e situação, idade, congregação, celular clicável (ligação ou WhatsApp) e o menu "⋯" com as ações de ciclo de vida. Cada aba só aparece para quem tem a permissão correspondente.

| Aba | Conteúdo | Fase |
| --- | --- | --- |
| Visão geral | Resumo das seções em cards, cada um com "Editar" que abre o modal daquela seção; mostra o último acompanhamento | MVP |
| Dados pessoais | Identificação e documentos | MVP |
| Contato e endereço | Telefones, email, endereço com CEP | MVP |
| Família | Membros do domicílio, papéis e responsáveis | MVP (básica) |
| Vida na igreja | Vínculo, conversão, apresentação, batismo, profissão de fé, admissão e a linha do tempo com os acompanhamentos | MVP |
| Contribuições | Recebíveis vinculados, somente leitura | MVP |
| Histórico | Quem alterou o quê e quando (audit log) | MVP |
| Notas pastorais | Anotações confidenciais, restritas ao pastor | F2 |
| Células | Participação e papel | PRD de Células |

No mobile, as abas viram rolagem horizontal. O skeleton espelha o cabeçalho e o card da aba ativa.

### Campos por seção

| Seção | Campo | Componente | Fase | Observação |
| --- | --- | --- | --- | --- |
| Identificação | Nome completo | Input | MVP | Obrigatório a partir de Novo convertido |
| Identificação | Como prefere ser chamado | Input | MVP | Usado em mensagens e listas |
| Identificação | Sexo | Select | MVP | Relatórios e ministérios |
| Identificação | Data de nascimento | `DatePicker` | MVP | Idade calculada, nunca guardada. Obrigatória em Membro em formação |
| Identificação | Estado civil | Select | MVP |  |
| Identificação | CPF | `CpfInput` (novo) | MVP | Dígito verificador; único por organização |
| Identificação | Outro documento | Select de tipo + Input | MVP | RG, passaporte, certidão de nascimento |
| Identificação | Data de casamento | `DatePicker` | F2 | Só se casado |
| Identificação | Foto | Upload (novo) | F2 | Também é dado pessoal |
| Identificação | Profissão, escolaridade, naturalidade | Input / Select | F2 |  |
| Contato | Celular principal + "é WhatsApp" | `PhoneInput` + Switch | MVP | Base da Mensageria; opcional para crianças |
| Contato | Telefone secundário | `PhoneInput` | MVP |  |
| Contato | Email | Input | MVP | Validado; não é único (famílias dividem email) |
| Endereço | CEP | `CepInput` (novo) | MVP | Autopreenche logradouro, bairro, cidade, UF |
| Endereço | Logradouro, número, complemento, bairro, cidade, UF | Input / Select | MVP | Editáveis após o autopreenchimento; podem vir da família |
| Família | Família e papel nela | `PersonPicker` + Select | MVP | Responsável obrigatório para menores de 18 anos |
| Vida na igreja | Vínculo | Select (via ação de promover) | MVP | Obrigatório |
| Vida na igreja | Congregação | Select | MVP | Obrigatório |
| Vida na igreja | Data da primeira visita | `DatePicker` | MVP | Alimenta o funil e o Painel |
| Vida na igreja | Data de conversão | `DatePicker` | MVP | Obrigatória em Novo convertido |
| Vida na igreja | Apresentação (data) | `DatePicker` | MVP | Para igrejas que apresentam crianças |
| Vida na igreja | Batizado? + data + igreja do batismo + batismo infantil? | Switch + `DatePicker` + Input + Switch | MVP | Alimenta o filtro "batizado" |
| Vida na igreja | Profissão de fé (data) | `DatePicker` | MVP | Para quem foi batizado na infância |
| Vida na igreja | Forma e data de admissão, igreja de origem | Select configurável + `DatePicker` + Input | MVP | Obrigatório em Membro |
| Vida na igreja | Como conheceu a igreja | Select configurável | F2 |  |
| Vida na igreja | Cargos eclesiásticos | Multi-select (novo) | F2 | Com datas de início e fim |
| Observações | Observações gerais | Textarea | MVP | Aviso na interface: não é lugar para assunto pastoral |

### Ciclo de vida

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-V01 | Ações no menu "⋯": Promover vínculo, Inativar, Transferir, Desligar do rol, Registrar falecimento, Reativar | MVP |
| RF-V02 | Cada ação pede data e motivo (quando aplicável) e gera um evento na linha do tempo com autor | MVP |
| RF-V03 | Promover vínculo pede só os campos que faltam para o novo estágio | MVP |
| RF-V04 | Transferência para outra congregação do iEzer muda a congregação e preserva o histórico | MVP |
| RF-V05 | "Apagar registro" só para cadastro sem vínculos (recebíveis, família, histórico de membresia), com confirmação explícita | MVP |
| RF-V06 | Ação "Registrar acompanhamento" no perfil e na linha da listagem: data, tipo (ligação, visita, mensagem, conversa), autor automático e observação curta. Aparece na linha do tempo | MVP |

### Família (básica)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-F01 | Família como domicílio com várias pessoas e papéis: responsável, cônjuge, filho, outro | MVP |
| RF-F02 | Toda pessoa menor de 18 anos tem pelo menos um responsável; o sistema não salva sem ele | MVP |
| RF-F03 | Endereço e telefone fixo compartilhados, com a pergunta "aplicar a toda a família?" ao editar | MVP |
| RF-F04 | Cadastrar um filho a partir do perfil do responsável, já com família e endereço preenchidos | MVP |
| RF-F05 | Visão "por família" na listagem e nos relatórios | F2 |

### Indicadores da jornada no Painel

O Painel inicial mostra um resumo geral da jornada das pessoas: contadores sem nomes, e cada contador abre a lista filtrada correspondente, respeitando as permissões de quem vê.

| Indicador | De onde vem o dado | Fase |
| --- | --- | --- |
| Visitantes nos últimos 30 dias | Data da primeira visita | MVP |
| Visitantes sem acompanhamento | Registro de acompanhamento | MVP |
| Pessoas sem atualização de contato | Data da última atualização dos contatos | MVP |
| Congregados prontos para o discipulado de batismo | Congregados não batizados há mais tempo que um prazo definido pela igreja | MVP (regra simples); completo com o PRD de Conteúdo |
| Novos convertidos sem célula | Vínculo com célula | PRD de Células |
| Membros que deixaram de participar | Frequência | PRD de Células/Frequência |

Os prazos que definem cada alerta (ex.: o que conta como contato desatualizado) são parâmetros por igreja, com um padrão de fábrica a definir com a piloto.

### Importação pela planilha modelo

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-I01 | Planilha .xlsx gerada por organização, com as listas daquela igreja como validação (dropdown) nas colunas | MVP |
| RF-I02 | Aba de instruções e uma linha de exemplo preenchida | MVP |
| RF-I03 | Formatos travados: data `dd/mm/aaaa`; CPF e telefone como texto | MVP |
| RF-I04 | Versão do modelo numa célula oculta; modelo desatualizado é recusado ou avisado | MVP |
| RF-I05 | Colunas "Consentimento coletado (S/N)" e "Data do consentimento" | MVP |
| RF-I06 | Pré-visualização: novos, atualizações, erros por linha, duplicados dentro do arquivo e contra a base. Para cada duplicado: pular a linha ou atualizar o registro existente | MVP |
| RF-I07 | Na confirmação, quem importa declara que a igreja tem os consentimentos. A declaração vai para o audit log | MVP |
| RF-I08 | Relatório final com o que entrou, o que foi atualizado e o que foi recusado (baixável) | MVP |

### Mesclagem de duplicados

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-M01 | Comparação lado a lado com escolha do valor campo a campo | F2 |
| RF-M02 | Recebíveis, família e histórico migram para o registro que fica | F2 |
| RF-M03 | "Não são a mesma pessoa" suprime a sugestão de forma permanente | F2 |
| RF-M04 | Relatório de possíveis duplicados (CPF, celular, email, nome + nascimento) | F2 |

### Configuração de listas

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-S01 | Listas por organização: formas de admissão, motivos de inativação e de desligamento, cargos eclesiásticos, como conheceu | Seed fixo no MVP; edição pela interface na F2 |
| RF-S02 | Padrão de fábrica evangélico: profissão de fé e batismo, transferência por carta, aclamação, reconciliação. Cargos: pastor, presbítero, diácono, evangelista, missionário, obreiro | MVP |
| RF-S03 | Itens de lista podem ser desativados ou renomeados, nunca apagados se já usados | F2 |

## Permissões

O acesso é uma matriz configurável de perfis de acesso × permissões: o produto define o catálogo de permissões, e o admin de cada igreja marca quais delas cada perfil tem.

### Estrutura

- **Permissões:** catálogo fixo, definido no código. Cada módulo declara as suas. A chave interna nunca muda; o nome e a descrição podem ser ajustados.
- **Perfis de acesso:** criados e editados pelo admin de cada igreja.
- **Usuários:** recebem um ou mais perfis de acesso por organização, e as permissões se somam (ex.: um usuário com Tesoureiro + Secretário). Um perfil na congregação vê só as pessoas dela; um perfil na sede vê todas as congregações.
- **Admin:** não é um perfil especial. É quem tem a permissão "Gerenciar perfis de acesso". No seed inicial, ela vai para o perfil Pastor.

### Catálogo do módulo Pessoas e padrão de fábrica

Os perfis de fábrica separam funções: o Secretário cuida do cadastro e do ciclo eclesiástico, sem nada financeiro; o Tesoureiro só vê pessoas e contribuições, o mínimo para vincular lançamentos; o Pastor tem acesso total, inclusive às notas pastorais. Contribuição de quem ainda não está cadastrado é lançada como "sem pessoa vinculada", e o cadastro fica com a secretaria.

| Nome na tela | Descrição exibida | Chave interna | Pastor | Tesoureiro | Secretário |
| --- | --- | --- | --- | --- | --- |
| Ver pessoas | Acessar a lista e o perfil das pessoas | `pessoas.ver` | Sim | Sim | Sim |
| Cadastrar pessoas | Incluir novas pessoas pelo cadastro rápido | `pessoas.criar` | Sim | Não | Sim |
| Editar dados cadastrais | Alterar dados pessoais, contato, endereço e família | `pessoas.editar` | Sim | Não | Sim |
| Mudar estágio na igreja | Promover de visitante a novo convertido, congregado ou membro | `pessoas.promover_vinculo` | Sim | Não | Sim |
| Alterar situação | Inativar, transferir, desligar do rol ou registrar falecimento | `pessoas.alterar_situacao` | Sim | Não | Sim |
| Registrar acompanhamento | Anotar ligações, visitas e conversas de cuidado | `pessoas.acompanhamento.registrar` | Sim | Não | Sim |
| Importar planilha | Trazer pessoas em lote pela planilha modelo | `pessoas.importar` | Sim | Não | Sim |
| Exportar dados | Baixar a lista de pessoas em planilha | `pessoas.exportar` | Sim | Não | Sim |
| Unir cadastros duplicados | Juntar dois registros da mesma pessoa em um só | `pessoas.mesclar` | Sim | Não | Sim |
| Apagar registro | Remover definitivamente um cadastro feito por engano | `pessoas.apagar_registro` | Sim | Não | Sim |
| Ver histórico de alterações | Consultar quem alterou o quê e quando | `pessoas.historico.ver` | Sim | Não | Sim |
| Ver contribuições | Ver dízimos e ofertas vinculados à pessoa | `pessoas.contribuicoes.ver` | Sim | Sim | Não |
| Acessar notas pastorais (protegida) | Ler e escrever anotações pastorais confidenciais | `pessoas.notas_pastorais.ver` / `.editar` | Sim | Não | Não |
| Editar listas da igreja | Alterar formas de admissão, motivos e cargos | `config.listas.editar` | Sim | Não | Não |
| Gerenciar perfis de acesso (protegida) | Criar perfis e definir suas permissões | `acesso.perfis.gerenciar` | Sim | Não | Não |

"Mudar estágio na igreja" é separada de "Editar dados cadastrais" porque, em muitas igrejas, a admissão como membro é decisão de assembleia ou conselho.

### Travas de segurança

1. **Permissões protegidas:** só quem já tem a permissão pode concedê-la a outro perfil. Toda concessão notifica quem já a possui e entra no log.
2. **Nunca ficar sem admin:** o sistema bloqueia a remoção de "Gerenciar perfis de acesso" do último usuário ativo que a tem.
3. **Log de permissões:** toda mudança registra autor, perfil afetado e o antes e depois.
4. **Restaurar padrão:** os perfis de fábrica podem ser editados e restaurados.
5. **Notas pastorais pertencem à igreja:** qualquer usuário com o perfil que as acessa vê todas, o que cobre pastor auxiliar e troca de pastor.

### Tela de perfis e permissões

- Permissões agrupadas por módulo (Pessoas, Financeiro, Configurações), com um switch e a descrição de cada uma.
- Permissões protegidas mostram um cadeado e explicam por que só quem já as tem pode concedê-las.
- Pares de chaves aparecem como um switch só ("Acessar notas pastorais" = `ver` + `editar`).
- Dependências automáticas: ativar "Editar dados cadastrais" liga "Ver pessoas"; desligar "Ver pessoas" desliga as dependentes, com aviso.
- Resumo em linguagem natural do perfil antes de salvar ("Este perfil pode ver e editar pessoas, ver contribuições e importar planilhas. Não acessa notas pastorais.").
- O nome amigável aparece também nas mensagens de bloqueio e no audit log. O back devolve o catálogo com chave, nome, descrição, módulo e se é protegida.

## Privacidade e LGPD

A base de pessoas de uma igreja é, por inteiro, dado pessoal sensível: a LGPD classifica convicção religiosa e filiação a organização religiosa como sensíveis (art. 5º, II) e não traz exceção para igrejas.

Para dado sensível, o art. 11 exige consentimento específico e destacado para finalidades específicas, ou uma das hipóteses restritas do inciso II. Qualquer documento ou exportação que sai da igreja revela a convicção religiosa da pessoa. A base legal de cada tratamento deve ser validada com o jurídico ou o encarregado (DPO) do cliente; o sistema precisa oferecer as ferramentas para cumpri-la. Referência: [Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm).

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-P01 | Autenticação real e perfis de acesso antes de dados de pessoas irem para produção (hoje o login é um flag no `localStorage`) | Pré-requisito |
| RF-P02 | Registro de consentimento por finalidade (cadastro na igreja, mensageria, uso de imagem), com data, versão do texto e forma de coleta (papel, planilha, digital). Revogável | MVP (cadastro); F2 (demais) |
| RF-P03 | Audit log com autor para criação, alteração, exportação, importação e leitura de notas pastorais | MVP |
| RF-P04 | Notas pastorais em endpoint próprio, fora do payload do perfil, criptografadas na aplicação | F2 |
| RF-P05 | Exportação e impressão controladas por permissão e registradas no log | F2 |
| RF-P06 | Direitos do titular: relatório "dados que temos sobre você" e anonimização que preserva totais financeiros e remove a identidade | F2 |
| RF-P07 | Minimização: nenhum dado de saúde (alergia, restrição alimentar) no perfil geral | Regra |
| RF-P08 | Na importação, declaração de quem importa de que a igreja tem os consentimentos, registrada no log | MVP |
| RF-P09 | Dados de criança e adolescente: consentimento específico dado por pelo menos um responsável (art. 14), registrado com data e autor, observando o melhor interesse da criança. Na importação, linhas de menores sem responsável são recusadas | MVP |
| RF-P10 | Indicadores do Painel mostram só contadores; a lista por trás de cada um respeita as permissões de quem abre | MVP |

A guarda das fichas em papel com o termo assinado é responsabilidade da igreja, e a interface de importação deve dizer isso.

## Requisitos técnicos

Os padrões do `iezer-front` valem integralmente; os pontos abaixo são onde eles precisam de ajuste ou de componente novo.

### Back

| ID | Requisito |
| --- | --- |
| RT-B01 | `GET /pessoas?page&pageSize&q&vinculo&situacao&organizacao&idadeMin&idadeMax&aniversarioMes&batizado&familia&sort` retorna `{ items, total, page }` |
| RT-B02 | Ações de ciclo de vida como endpoints próprios (`POST /pessoas/:id/promover`, `/inativar`, `/transferir`, `/desligar`, `/falecimento`, `/reativar`, `/acompanhamentos`), para garantir o evento de histórico |
| RT-B03 | Toda rota confere a permissão no servidor; esconder no front é só experiência de uso |
| RT-B04 | Notas pastorais e contribuições em endpoints separados do detalhe da pessoa |
| RT-B05 | Data de nascimento e demais datas civis como `@db.Date`, não `DateTime` |
| RT-B06 | Telefone normalizado no back (dígitos, com DDI) para a Mensageria; o front continua exibindo mascarado. Registrar a exceção ao padrão do `PhoneInput` no `CLAUDE.md` |
| RT-B07 | CPF único por organização, com validação de dígito verificador; "outro documento" em campos próprios (tipo + número) |
| RT-B08 | Permissões modeladas como capacidades por perfil (catálogo + tabela perfil × permissão + usuário × perfil × organização), nunca como nível numérico. Um usuário pode ter vários perfis; as permissões se somam |
| RT-B09 | Endpoint do catálogo de permissões com chave, nome, descrição, módulo e flag de protegida |
| RT-B10 | Importação processada em duas etapas: pré-visualização sem gravar e confirmação atômica |
| RT-B11 | Entidades `Family` e `FamilyMember` (papel); validação no servidor de responsável obrigatório para menores de 18 anos |
| RT-B12 | Entidade `FollowUp` (acompanhamento): pessoa, data, tipo, autor, observação |
| RT-B13 | `GET /pessoas/indicadores` devolve só contadores calculados no servidor, por organização, com os prazos parametrizados por igreja |

### Front

| ID | Requisito |
| --- | --- |
| RT-F01 | Chaves em `query-keys.ts`: `pessoas.list(filtros)`, `pessoas.detail(id)`, `me.permissions`. Paginação com `placeholderData: keepPreviousData` |
| RT-F02 | `PersonPicker`: combobox com busca no servidor (Popover + Command, Radix). **Substitui o `Select` de membro em Contas a Receber**, que quebra quando a lista passar a ser paginada |
| RT-F03 | `CpfInput` (ou modo `cpfOnly` no `CpfCnpjInput`): pessoa física não tem CNPJ |
| RT-F04 | `CepInput` com [ViaCEP](https://viacep.com.br): validar os 8 dígitos antes da consulta, tratar o retorno `erro: true` de CEP inexistente e liberar o preenchimento manual em qualquer falha |
| RT-F05 | Aniversário e idade calculados sem `new Date(iso)` (off-by-one já documentado no projeto) |
| RT-F06 | `usePermission("...")` e `<Can permission="...">`: ação ou aba sem permissão some da interface |
| RT-F07 | Componentes novos (`PersonPicker`, `CepInput`, `CpfInput`, `MultiSelect`, `AvatarUpload`, `Tabs`) passam pelo checklist de bugs da instalação via CLI: border sem cor, `bg-background`, `!classe`, `[--var]`, `duration-0` |
| RT-F08 | Corrigir o border sem cor do `sheet.tsx` na mesma tarefa em que ele entra nos filtros mobile |
| RT-F09 | Skeleton da listagem (tabela e cards) e do perfil (cabeçalho + card da aba ativa) espelhando o layout real |
| RT-F10 | Primeira página de perfil do app: definir o layout de página de detalhe como padrão reutilizável e documentá-lo no `CLAUDE.md` |

## Migração do modelo atual

Todo `Member` existente vira uma `Person` com vínculo Membro, sem perda de vínculo financeiro.

| Hoje | Vira |
| --- | --- |
| `Member` | `Person` com vínculo Membro; situação Ativo ou Inativo conforme `isActive` |
| `document` | CPF, se tiver 11 dígitos e dígito verificador válido; senão, "outro documento" |
| `birthDate` (`DateTime`) | `@db.Date`, convertendo pela data local para não deslocar um dia |
| `cellName` (texto livre) | Campo legado somente leitura no perfil até existir a entidade Célula; depois, conciliação assistida por nome |
| `Receivable.memberId` | `personId`; `onDelete` passa de `SetNull` para `Restrict` |
| Sem organização | Todos vão para a sede, com ação em lote para redistribuir entre congregações |
| Rota `/app/cadastro/membros` | Redireciona para `/app/pessoas` |
| Select de membro em Contas a Receber | `PersonPicker` com busca no servidor |

Pessoas migradas que não têm nome completo, forma ou data de admissão ficam com esses campos vazios e sinalizadas como "cadastro incompleto"; a regra de obrigatoriedade por estágio vale só para novas edições e promoções.

## Recorte por fase

O MVP entrega o ciclo completo de cadastro, importação e permissões; tudo o que é refinamento ou depende de validação com a piloto fica para F2 e F3.

Diagrama no Doc, transcrito:

- Pré-requisitos (bloqueiam o MVP): autenticação real e perfis de acesso (PRD de Acesso); organizationId e seletor de organização funcionais; audit log com autor.
- Gate: autenticação real e organizações em produção.
- MVP: listagem paginada no servidor e cadastro rápido com checagem de duplicado; perfil (visão geral, dados, contato, vida na igreja, contribuições, histórico); quatro estágios de vínculo, mais Membro em formação, e ciclo de vida; família básica e crianças com responsável obrigatório; acompanhamento e indicadores da jornada no Painel; importação pela planilha modelo, com pré-visualização e consentimento; permissões configuráveis por função, com travas; PersonPicker em Contas a Receber e migração de Member para Person.
- Gate: base da igreja piloto importada e validada.
- F2: notas pastorais restritas e criptografadas; mesclagem de duplicados e visão por família; exportação, ações em lote, foto e cargos eclesiásticos; edição das listas pela interface; direitos do titular e anonimização.
- F3: documentos imprimíveis (a validar com a piloto); autocadastro por QR e edição do perfil pela própria pessoa.

A fase de cada requisito está na coluna Fase das tabelas de Requisitos funcionais e de Privacidade.

## Dependências

O MVP de Pessoas só vai para produção depois do PRD de Acesso (autenticação e permissões); os demais PRDs dependem de Pessoas, e não o contrário.

| PRD | Relação | O que Pessoas precisa ou entrega | Bloqueia o MVP? |
| --- | --- | --- | --- |
| Acesso (Configurações › Perfis e permissões) | Pessoas depende | Autenticação real, usuário ligado a `Person`, catálogo de permissões, perfis por organização, travas, audit log com autor | Sim |
| Organizações (multi-igreja) | Pessoas depende | `organizationId` real e seletor de organização funcional | Sim |
| Financeiro (Contas a Receber) | Afetado | Troca do Select pelo `PersonPicker`, `personId` com `Restrict` e lançamento "sem pessoa vinculada" para quem não está cadastrado | Sim (entra junto) |
| Painel | Afetado | Card de indicadores da jornada (contadores que abrem listas filtradas) | Não (entra junto com o MVP) |
| Células | Depende de Pessoas | Entidade Célula, papel na célula, conciliação do `cellName`, escopo de permissão do líder, indicador "novos convertidos sem célula" | Não |
| Frequência | Depende de Pessoas | Presença em culto e célula; indicador "membros que deixaram de participar" | Não |
| Kids | Depende de Pessoas | Usa a criança e os responsáveis já cadastrados em Pessoas (ver aviso abaixo) | Não |
| Conteúdo | Depende de Pessoas | Trilhas de discipulado; refina o indicador "prontos para o discipulado de batismo" | Não |
| Mensageria | Depende de Pessoas | Celular normalizado, flag de WhatsApp, consentimento por finalidade, nome de preferência | Não |
| Relatórios | Depende de Pessoas | Funil por estágio, aniversariantes, ativos e inativos, faixa etária, batizados, por família | Não |

### Aviso para mapear no PRD de Kids

Crianças já são Pessoas desde o MVP, com responsável obrigatório e consentimento dado por ele. O PRD de Kids trata do ministério infantil e precisa definir:

- [ ] Pessoas autorizadas a retirar a criança (podem ser diferentes dos responsáveis)
- [ ] Check-in e etiqueta de segurança
- [ ] Turmas ou salas por faixa etária
- [ ] Dados de saúde (alergia, restrição alimentar): se entram, onde ficam e quem vê
- [ ] Uso de imagem
- [ ] Passagem de Membro em formação para Membro na profissão de fé
- [ ] Regras para adolescentes que já frequentam cultos e células

## Fora de escopo e validações com a piloto

**Fora de escopo deste PRD:** check-in e regras do ministério infantil (Kids), células e frequência, envio de mensagens, campos personalizados criados pela igreja e campo de nome social. Autocadastro por link ou QR e edição do perfil pela própria pessoa estão previstos para a F3, em PRD próprio.

**A validar com a igreja piloto:**

- [ ] Planilha modelo testada com o voluntário que vai digitar as fichas, antes de fechar o formato
- [ ] Nomes amigáveis das permissões compreendidos por quem vai configurá-las
- [ ] Lista padrão de formas de admissão, motivos e cargos cobre o que a igreja usa
- [ ] Nome que a igreja usa para o estágio Membro em formação, e se ela o usa
- [ ] Prazos padrão dos indicadores do Painel (contato desatualizado, congregado pronto para o discipulado)
- [ ] Interesse real em documentos imprimíveis (carteirinha, carta de transferência, certificado de batismo)
- [ ] Critérios de sucesso da seção Contexto calibrados com metas da igreja
- [ ] Próximas rodadas: aba "Resumo para a liderança" em linguagem simples, sem termos técnicos

### Visão futura (fora deste PRD)

Ideias trazidas pelo pastor da igreja piloto, registradas no plano de demandas. O módulo Pessoas já precisa garantir as condições abaixo para que elas funcionem depois.

| Ideia | Condição que Pessoas já garante ou precisa garantir |
| --- | --- |
| "Pergunte ao iEzer": consultas por voz ou texto curto (ex.: quantos visitantes viraram congregados nos últimos 3 meses) | Toda mudança de estágio datada na linha do tempo; respostas respeitam as permissões de quem pergunta; envio de dado sensível a provedor de IA exige base legal e contrato adequados |
| Devocionais gerados a partir do esboço do domingo, com envio automático e notificação no app | Consentimento por finalidade; preferência de canal; acesso da pessoa ao app como membro (D1: pessoa com acesso opcional) |

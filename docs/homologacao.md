# Roteiro de homologação — app das igrejas e app admin

Para fazer no navegador, no ambiente de homologação atual, só com dados fictícios.
Cobre o MVP (Sprints 1 a 13), o back-office (Sprints 15 a 22) e a família (Sprints 23 e 24).

**Como usar**

- Siga as partes na ordem: a Preparação monta a equipe e as igrejas que as outras partes usam.
- Cada seção diz o perfil usado. Faça cada passo e compare com a coluna "O que deve acontecer".
- O que falhar vai na tabela de **Achados**, no fim, com a seção e o número do passo (ex.: 1.7-4).
- Marcas:
  - **[celular]**: confira também abaixo de 768px. Tabela vira cards, filtros abrem num Sheet de baixo, modal continua usável com o teclado aberto no iPhone.
  - **[pastor]**: passo das jornadas que o pastor vai percorrer.
  - **[depende: X]**: precisa de algo que ainda não existe. Pode pular e voltar depois.

**Pré-requisitos que ainda faltam** (os passos com [depende] dizem qual):

| Item | Onde | Sem ele |
| --- | --- | --- |
| Projeto do app admin na Vercel (Build `npm run build:admin`, Output `dist-admin`) | Vercel | Testar o admin só local (`npm run dev:admin`, porta 5174) |
| `ADMIN_WEB_ORIGIN` com a URL do admin | Render | O admin publicado não fala com a API |
| `VITE_APP_URL` e `VITE_ADMIN_URL` nos dois projetos | Vercel | "Abrir no modo suporte" e "Voltar ao back-office" apontam para o lugar errado |
| `SUPABASE_SERVICE_ROLE_KEY` (o bucket `iezer-documentos` já existe) | Render | Troca do responsável e exportação respondem 503 |
| `RESEND_API_KEY` e domínio verificado | Render + Resend | E-mails só no log do back |
| `RESEND_WEBHOOK_SECRET` e o endpoint no Resend | Render + Resend | Webhook responde 503 (simulação na seção 2.12) |
| `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` e o redirect autorizado | Render + Google Cloud | Botão do Google não entra |
| Segundo Administrador iEzer ativo | App admin (seção 0.4) | Escrita e emergência no suporte ficam sem aprovador |

---

## 0. Preparação

### 0.1 Navegadores e celular

- O app das igrejas e o app admin usam o mesmo cookie de sessão: entrar num derruba a sessão do outro no mesmo navegador.
- Janelas anônimas do mesmo navegador também dividem a sessão entre si.
- Use **um perfil de navegador por pessoa logada ao mesmo tempo**. Sugestão:
  - Chrome perfil "Pastor A";
  - Chrome perfil "Secretário A";
  - Safari para o Tesoureiro A;
  - Firefox (ou Chrome perfil "Equipe") para o app admin, trocando de conta da equipe quando o passo pedir.
- No celular: o app das igrejas no Safari (iPhone) e o app autenticador (Google Authenticator, Microsoft Authenticator ou 1Password).
- No desktop, para os passos [celular], dá para usar o modo responsivo do navegador (largura 375px). Repita no iPhone os passos com modal e teclado.

### 0.2 E-mails

- Enquanto o Resend não tiver domínio, nenhum e-mail sai: o back escreve no log o assunto, o destinatário e o link.
  - Local: no terminal do `npm run dev`.
  - Render: na aba Logs do serviço.
- Convites também têm "Copiar link" (Configurações › Usuários e Equipe do admin). Copiar gera um link novo e o anterior deixa de valer.
- O link do convite de admin de igreja nunca aparece no app admin (B8): pegue-o no log.

### 0.3 Dados fictícios

- O banco é único, sem backup, e o log de auditoria não pode ser apagado. **Nada de dado real.**
- Nomes, e-mails e telefones inventados. E-mails no domínio `@iezer.local` (não recebe nada; tudo pelo log).
- CPFs válidos e fictícios para os testes: `140.220.261-03` e `140.220.262-86`.
- CNPJs válidos e fictícios: `14.022.026/0001-45` (igreja A) e `14.022.027/0001-90` (igreja B).

### 0.4 Equipe iEzer

Quatro contas da equipe, cada uma com TOTP no app autenticador. Não crie nada antes da hora; esta seção só descreve.

| Conta | E-mail sugerido | Papel | Como nasce |
| --- | --- | --- | --- |
| Administrador 1 | `admin.um@iezer.local` (já existe) | Administrador iEzer | Já é o Administrador ativo. Se ninguém tiver a senha ou o app: `npm run user:create` para a senha e "Redefinir autenticador" por outro Administrador. `npm run suporte:agente -- <email> "<nome>"` só roda quando não há Administrador ativo |
| Administrador 2 | `hml.admin2@iezer.local` | Administrador iEzer | Convite em Equipe, feito pelo Administrador 1 (seção 2.3) |
| Suporte | `hml.suporte@iezer.local` | Suporte | Convite em Equipe |
| Implantação | `hml.implantacao@iezer.local` | Implantação (só) | Convite em Equipe |

Ordem: Administrador 1 entra (2.1) → convida os outros três (2.3) → cada um aceita o convite no próprio perfil de navegador (2.1).

### 0.5 Igrejas de teste

Duas igrejas novas, criadas pela tela "Nova igreja" do admin (seção 2.5) com a conta Implantação:

| Igreja | Para quê | Congregação | Primeiro admin (Pastor) | Outros usuários |
| --- | --- | --- | --- | --- |
| **A** — "Igreja Homologação Alfa", CNPJ `14.022.026/0001-45` | Jornada da piloto (Parte 1), pedidos de acesso, avisos, painel | "Congregação Alfa Norte" | `hml.pastor.a@iezer.local` (**Pastor A = você**) | Ver a tabela abaixo, todos convidados pelo Pastor A na seção 1.5 |
| **B** — "Igreja Homologação Beta", CNPJ `14.022.027/0001-90` | Situação, troca do responsável, fim de contrato (termina Suspensa) | nenhuma | `hml.pastor.b@iezer.local` | `hml.secretario.b@iezer.local` (Secretário B, Secretário na sede), convidado pelo Pastor B na 2.6; `hml.pastor.b2@iezer.local` (Pastor B2), admin novo pelo "Recuperar administrador" na 2.6 |

Usuários da igreja A:

| Usuário | E-mail | Perfil | Para quê |
| --- | --- | --- | --- |
| Pastor (o pastor de verdade) | `hml.pastor@iezer.local` | Pastor, na sede | Segundo admin (1.5-7); faz a 1.1 no próprio celular e o Roteiro do pastor (1.21) |
| Secretário A | `hml.secretario.a@iezer.local` | Secretário, na sede | Rotina da secretaria |
| Tesoureiro A | `hml.tesoureiro.a@iezer.local` | Tesoureiro, na sede | Financeiro e negativos |
| Secretário Norte | `hml.secretario.norte@iezer.local` | Secretário, só na Congregação Alfa Norte | Escopo por congregação (1.11) |
| Voluntário 1 e 2 | `hml.voluntario1@iezer.local`, `hml.voluntario2@iezer.local` | Secretário, na sede | Descartáveis: desligar do rol e falecimento (1.12-6 e 1.12-7) |

- O responsável pela conta pode ser a mesma pessoa do primeiro admin, com o mesmo e-mail.
- A igreja nasce em Implantação; o Pastor recebe o convite (link no log).
- Suspender a B não derruba quem está testando a A.
- Na B, cadastre umas cinco pessoas (uma família com menor) e um lançamento, para a exportação ter conteúdo.

Comandos que existem, só para referência (não use no lugar das telas):

- `npm run user:create -- <email> <nome> <senha> [status]`: usuário ou troca de senha;
- `npm run user:assign -- <email> <PASTOR|TESOUREIRO|SECRETARIO> [slug]`: atribuição direta;
- `npm run acesso:seed` e `npm run pessoas:seed`: dados da sede piloto antiga.

### 0.6 Arquivos para levar

- Um PDF pequeno (menos de 1 MB) e um JPG, para os anexos de documento.
- Um PDF falso: um `.txt` renomeado para `.pdf`, para a recusa por tipo.
- Um arquivo com mais de 10 MB, para a recusa por tamanho.
- A planilha modelo baixada na seção 1.13, preenchida com os casos de lá.

---

## Parte 1 — App das igrejas

Ordem da jornada da piloto, na igreja A. Pré-requisito: seções 2.1 e 2.3 e os passos 2.5-1 a 2.5-7 feitos (equipe e igrejas criadas).

### 1.1 Convite, senha, termos e 2FA

Perfil: Pastor A (convite do primeiro admin, vindo da criação da igreja).

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Pegar no log o e-mail do convite do Pastor A | Assunto e texto com o nome da igreja; quem convidou aparece como "Equipe iEzer" |
| 2 | Abrir o link [celular] [pastor] | Página do convite com quem convidou e o resumo do acesso (perfil Pastor na sede) |
| 3 | Tentar senha com menos de 12 caracteres, senha com o e-mail, senha com o nome da igreja e `Senha123456789` (vazada) | Cada uma recusada com o motivo, sem perder o que foi digitado |
| 4 | Definir senha boa, marcar os termos e aceitar [pastor] | Entra; antes do app, pede a configuração do 2FA |
| 5 | Configurar o 2FA pelo app autenticador (QR no desktop; no celular, "copiar chave") [celular] [pastor] | Código de 6 dígitos aceito numa casa por dígito; colar funciona; aparecem os códigos de recuperação |
| 6 | Guardar os códigos e seguir | Chega ao Painel |
| 7 | Sair e entrar de novo com o código por e-mail (no log) | O código por e-mail também vale para conta de igreja |
| 8 | Sair e entrar com um código de recuperação (5 + hífen + 5) | Entra; aquele código não vale de novo |
| 9 | Abrir o mesmo link do convite outra vez | Convite já usado, sem formulário |
| 10 | Olhar o Painel [pastor] | Checklist de primeiro acesso e a faixa âmbar de admin único |

### 1.2 Login e segurança

Perfil: Pastor A (e Secretário A depois da seção 1.5).

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Login com e-mail e senha + código [celular] | Entra; no log, alerta de login em dispositivo novo |
| 2 | Errar a senha 5 vezes seguidas e tentar a 6ª | Mensagem de bloqueio por 15 min com "Esqueci minha senha"; no log, e-mail de bloqueio ao usuário |
| 3 | No admin, Painel | A igreja A aparece em "Com login bloqueado agora" (o painel tem cache de 2 min) |
| 4 | "Esqueci minha senha" com o e-mail bloqueado | E-mail de redefinição no log; a resposta é a mesma para e-mail que não existe |
| 5 | Abrir o link, definir senha nova [celular] | Senha trocada, bloqueio zerado, outras sessões encerradas |
| 6 | Abrir o mesmo link outra vez | Link já usado ou vencido |
| 7 | [depende: Google] "Entrar com Google" com o e-mail de um usuário ativo | Entra; com 2FA ativo, pede o código antes do app |
| 8 | [depende: Google] Google com e-mail sem usuário nem convite | Volta ao login com a mensagem de recusa |
| 9 | [depende: Google] Aceitar um convite pelo Google (Secretário A) | O primeiro login consome o convite e entra |

### 1.3 Minha conta

Perfil: Pastor A; repetir os passos 1 a 3 com o Secretário A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Menu do usuário › Minha conta [celular] | Senha, 2FA, sessões, meus acessos e e-mail |
| 2 | Trocar a senha (atual errada, depois certa) | Errada recusada; certa troca e mantém esta sessão |
| 3 | Sessões: entrar em outro navegador e encerrar aquela sessão daqui | A outra cai no próximo clique |
| 4 | Trocar o e-mail para outro `@iezer.local` | Confirmação no e-mail novo, aviso no antigo (log); só troca depois do link |
| 5 | Trocar o e-mail para um e-mail da equipe iEzer (ex.: `hml.suporte@iezer.local`) | Recusado |
| 6 | Gerar novos códigos de recuperação | Os antigos param de valer |
| 7 | Tentar desligar o 2FA (Pastor) | Não deixa: perfil com permissão protegida exige 2FA |
| 8 | Secretário: ligar e desligar o 2FA (opcional para ele) | Funciona; o login passa a pedir o código e depois deixa de pedir |

### 1.4 Organização e organização ativa

Perfil: Pastor A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Configurações › Organização [pastor] | Sede e "Congregação Alfa Norte" com os dados da criação; responsável pela conta e encarregado de LGPD só leitura |
| 2 | Criar a congregação "Congregação Alfa Sul" e renomear | Aparece na lista e no seletor de organização |
| 3 | Trocar no seletor para Alfa Norte [celular] | Pessoas e Financeiro mostram só os dados dela |
| 4 | Escolher "Todas as congregações" | Visão consolidada; Financeiro e cadastros escondem o criar; Pessoas mantém o cadastro rápido, que pede a congregação |
| 5 | Desativar a Alfa Sul | Some do seletor; os dados dela continuam na auditoria |

### 1.5 Usuários e convites

Perfil: Pastor A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Configurações › Usuários › Convidar: Secretário A a partir de uma pessoa nova pelo cadastro rápido dentro do fluxo [pastor] | Resumo em linguagem natural confere com o perfil Secretário na sede |
| 2 | Convidar o Tesoureiro A a partir de uma pessoa já cadastrada (PersonPicker) | Convite pendente na lista |
| 3 | "Copiar link" do convite do Tesoureiro e abrir no Safari [celular] | Abre a página do convite; o link anterior deixou de valer |
| 4 | Convidar de novo o mesmo e-mail | Recusado: já há convite pendente |
| 5 | Convidar um e-mail de outra igreja (ex.: `hml.pastor.b@iezer.local`) ou da equipe | Recusado |
| 6 | Secretário e Tesoureiro aceitam (cada um no seu perfil de navegador) | Entram sem 2FA obrigatório; aceitam os termos |
| 7 | Convidar o pastor como segundo admin (`hml.pastor@iezer.local`, perfil Pastor na sede) e guardar o link do log. O aceite fica para a sessão com ele (1.21, ordem 1) | Convite pendente na lista; a faixa de admin único continua até ele aceitar |
| 8 | Convidar o Secretário Norte (perfil Secretário só na Congregação Alfa Norte) e os Voluntários 1 e 2 (Secretário na sede); cada um aceita no seu perfil de navegador | Resumo do Secretário Norte cita só a Alfa Norte; os três ativos |
| 9 | Filtros por status (atalhos) e por perfil/organização [celular] | Lista vira cards no celular; contagens certas |
| 10 | Desativar o Secretário com ele logado [pastor] | Ele cai no próximo clique; login recusado |
| 11 | Reativar | Volta a entrar |
| 12 | "Redefinir 2FA" de um usuário com 2FA | 2FA apagado, sessões dele encerradas, alerta no log |

### 1.6 Perfis de acesso e permissões

Perfil: Pastor A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Configurações › Perfis: abrir Pastor, Secretário e Tesoureiro | Permissões de fábrica; restaurar padrão só nos de fábrica |
| 2 | Duplicar o Secretário como "Secretário Júnior" | Tela de permissões com o resumo |
| 3 | Ligar "Editar pessoas" com "Ver pessoas" desligado | Dependência liga sozinha; o resumo muda |
| 4 | Prévia do perfil | Mostra só as telas que o perfil alcança |
| 5 | Tirar "Gerenciar perfis" do perfil Pastor (antes da sessão do pastor, o Pastor A é o único admin) | Bloqueado: a igreja ficaria sem admin |
| 6 | Tentar alterar o próprio acesso (Usuários › você) | Bloqueado |
| 7 | Dar uma permissão protegida (ex.: "Autorizar suporte") ao Secretário Júnior e atribuí-lo a alguém sem 2FA | A pessoa recebe e-mail da permissão protegida (log) e, na próxima tela, precisa configurar o 2FA |
| 8 | Apagar o Secretário Júnior com alguém atribuído | Pede para escolher para qual perfil mover os usuários |

### 1.7 Pessoas: lista, cadastro rápido, duplicados, menor

Perfil: Secretário A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Pessoas: busca, atalhos (Membros, Visitantes, Novos convertidos, Congregados, Aniversariantes), ordenação e paginação [celular] [pastor] | Lista paginada no servidor; filtros e busca ficam na URL; voltar do perfil mantém tudo |
| 2 | Filtros no Sheet, com "Aplicar" e "Limpar" [celular] | No celular o Sheet abre de baixo; o badge conta os filtros |
| 3 | Cadastro rápido de um visitante [celular] [pastor] | Pede só o mínimo do vínculo; abre ou volta para a lista com a pessoa |
| 4 | Cadastrar outro com o mesmo celular | Aviso de possível duplicado, com o link para a pessoa; dá para seguir |
| 5 | Cadastrar com o CPF `140.220.261-03` duas vezes | O segundo é bloqueado |
| 6 | CPF com dígito errado (ex.: `140.220.261-04`) | Recusado no campo |
| 7 | Cadastrar uma criança (menos de 18) sem responsável | Exige responsável e consentimento |
| 8 | Cadastrar a criança escolhendo o responsável e marcando o consentimento | Criada; aparece na família do responsável |
| 9 | Teclado aberto no iPhone dentro do cadastro rápido [celular] | Botões e campos continuam alcançáveis, sem a página pular |

### 1.8 Perfil da pessoa e edição por seção

Perfil: Secretário A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Abrir uma pessoa: abas Visão geral, Dados pessoais, Contato e endereço, Família, Vida na igreja, Histórico [celular] [pastor] | Abas certas para o perfil; sem Contribuições nem Acesso |
| 2 | Editar cada seção pelo modal | Salva só a seção; toast de sucesso |
| 3 | CEP no endereço | Preenche rua, bairro, cidade e UF |
| 4 | Pessoa com cadastro incompleto | Aviso "Cadastro incompleto" abaixo das abas; a ação abre a seção que falta |
| 5 | Datas (nascimento, batismo) com o DatePicker | Sem deslocar o dia; aparecem como DD/MM/AAAA |
| 6 | Telefone com DDD | Mostra com máscara; "Ligar" e "WhatsApp" abrem certo [celular] |
| 7 | "Apagar registro" de uma pessoa recém-criada, sem vínculos | Apaga; com parente ou família, recusa com o motivo |

### 1.9 Famílias

Perfil: Secretário A. Monte um domicílio com casal, dois filhos (um menor) e um "Outro".

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Pessoas › Famílias: lista com busca pelo nome da família e pelo nome de um membro [celular] [pastor] | Tabela no desktop, cards no celular; quantidade de pessoas, contato principal e endereço |
| 2 | Abrir a família | Cabeçalho com nome, "N pessoas", endereço; "Adicionar pessoa", "Atualizar endereço", "Renomear" |
| 3 | Lista: estrela no contato principal, papel, idade, vínculo, relações em texto ("cônjuge de…", "filho de… e …") | Texto bate com o domicílio |
| 4 | "Adicionar pessoa" buscando alguém já cadastrado, com papel | Entra na família |
| 5 | "Adicionar pessoa" com um nome que não existe › "Cadastrar nova pessoa" [celular] | Abre o cadastro rápido com o nome digitado e o papel; "Usar o endereço do domicílio" marcado |
| 6 | Menu ⋯: trocar papel; definir outro contato principal | Estrela muda; o endereço do domicílio passa a ser o do novo contato |
| 7 | Remover o contato principal da família | A estrela vai para o próximo adulto pela ordem de entrada |
| 8 | Deixar só o menor na família | Aviso de família sem contato principal, com a ação para definir |
| 9 | "Atualizar endereço" [celular] | Dialog com o endereço e os membros; marcados os que tinham o endereço antigo; muda só quem ficou marcado |
| 10 | Remover o último membro | Volta para a lista de famílias |
| 11 | Remover o responsável de um menor | Recusado: o menor ficaria sem responsável |

### 1.10 Aba Família e parentes

Perfil: Secretário A. Monte avós, pais e netos em domicílios diferentes.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Aba Família do perfil [celular] [pastor] | Lista do domicílio só leitura, com "Abrir família"; sem menu ⋯ |
| 2 | Pessoa sem família: "Criar família" e "Adicionar a uma família" (busca de família, papel, "Usar o endereço do domicílio") | Funciona; a página da família abre |
| 3 | "Cadastrar filho" a partir de um adulto | Criança cadastrada já no domicílio e ligada como filho (parentesco) |
| 4 | Bloco Parentes › "Adicionar parente": pai/mãe, filho, cônjuge, com PersonPicker | Aparece "mãe de…", "filho de…", com link para a ficha |
| 5 | Ver na ficha do neto | Avós e irmãos deduzidos aparecem em texto |
| 6 | Tentar: a pessoa como parente de si mesma, um terceiro pai, um segundo cônjuge vivo, um ciclo (neto como pai do avô) | Cada um recusado com o motivo |
| 7 | "Cadastrar nova pessoa" pela busca de parente | Cria e liga; se a regra recusar o laço, a pessoa fica criada com aviso |
| 8 | ⋯ "Remover parentesco" | Some dos dois lados |

### 1.11 Escopo por congregação

Perfil: Secretário Norte (Secretário só na Congregação Alfa Norte).

Antes, com o Secretário A e o seletor em "Todas as congregações":

- cadastrar na Alfa Norte "Norte Um" (adulto) e "Norte Dois";
- pôr o Norte Um no domicílio da sede montado na 1.9 ("Adicionar pessoa");
- ligar o Norte Um como filho de um adulto da sede ("Adicionar parente");
- copiar o endereço (URL) da ficha de uma pessoa da sede.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Seletor de organização | Só a Alfa Norte, sem "Todas as congregações" |
| 2 | Pessoas: lista e busca pelo nome de uma pessoa da sede [celular] | Só pessoas da Alfa Norte; a da sede não aparece |
| 3 | PersonPicker (ex.: "Adicionar parente" na ficha do Norte Dois) buscando uma pessoa da sede | Não acha; só oferece pessoas da Alfa Norte |
| 4 | Colar a URL da ficha da pessoa da sede | "Não encontrado", sem nenhum dado dela |
| 5 | Ficha do Norte Um › aba Família | Domicílio aparece; os membros da sede vêm sem contato nem endereço e sem link para a ficha |
| 6 | Pessoas › Famílias | A família da sede aparece (tem alguém da Alfa Norte); o nome do contato principal aparece, mas o celular e o endereço somem quando ele é da sede |
| 7 | Ficha do Norte Um › Parentes | O pai ou a mãe da sede só com nome e parentesco, sem link |
| 8 | Configurações › Auditoria | O Secretário de fábrica não tem a tela. Se quiser conferir: perfil duplicado com "Ver auditoria", atribuído só na Alfa Norte; aparecem só linhas da Alfa Norte |

### 1.12 Ciclo de vida, acompanhamento e Painel

Perfil: Secretário A; os passos 6 e 7 com o Pastor A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | ⋯ "Promover vínculo": visitante → novo convertido → membro [pastor] | Pede só o que falta para o vínculo novo; menor sem responsável fica bloqueado com aviso |
| 2 | "Inativar", "Reativar" | Situação muda; evento na linha do tempo (aba Vida na igreja) |
| 3 | "Transferir" para a Alfa Norte | Se a Alfa Norte não está no seletor atual, o perfil volta para a lista |
| 4 | "Registrar acompanhamento" pelo perfil e pela linha da lista [celular] | Entra na linha do tempo e no card |
| 5 | Painel: indicadores da jornada [pastor] | Contadores batem; clicar abre Pessoas com o chip do indicador |
| 6 | "Desligar do rol" o Voluntário 1, com ele logado | Acesso suspenso na hora (ele cai no próximo clique); toast avisa; admins recebem e-mail (log) |
| 7 | "Registrar falecimento" do Voluntário 2 | Mesmo efeito; a pessoa sai das listas de ativos |

### 1.13 Importação pela planilha

Perfil: Secretário A, com uma congregação escolhida no seletor (não "Todas").

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Pessoas › Importar › baixar o modelo [pastor] | `.xlsx` com o código do modelo na planilha e as listas suspensas |
| 2 | Abrir no Excel e preencher: uma linha certa, uma com data inválida, uma duplicada (mesmo celular de alguém), um menor sem responsável [pastor] | Dropdowns funcionam |
| 3 | Enviar [pastor] | Prévia mostra cada caso com a mensagem do back; nada gravado ainda [celular] |
| 4 | Escolher "pular" num duplicado e "atualizar" noutro; marcar a declaração; confirmar [pastor] | Relatório com o resultado; baixar o CSV |
| 5 | Abrir o modelo no **Numbers**, editar, Arquivo › Exportar para › Excel (.xlsx) e enviar | Prévia funciona (o código do modelo vem da célula visível, mesmo sem a aba oculta) |
| 6 | Subir o modelo no **Google Planilhas**, editar, Arquivo › Fazer download › Microsoft Excel (.xlsx) e enviar | Prévia funciona |
| 7 | Enviar o modelo de outra congregação (baixe com outra selecionada) | Recusado: planilha de outra organização |
| 8 | Enviar um `.xlsx` qualquer, sem o código | Recusado: modelo inválido |

### 1.14 Contas a Receber e Financeiro

Perfil: Tesoureiro A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Financeiro › Contas a Receber › nova receita, escolhendo a pessoa pelo PersonPicker [celular] | Busca no servidor; a pessoa fica salva pelo nome |
| 2 | Receita recorrente mensal (3 parcelas) e "baixar" uma | Três parcelas; a baixada muda de situação |
| 3 | Excluir a série inteira | Some a série |
| 4 | Contas a Pagar e cadastros (categorias, centros de custo, contas, fornecedores) | Abrem e gravam; fornecedor com CNPJ inválido recusado |
| 5 | Abrir a pessoa da receita › aba Contribuições | Lançamentos dela aparecem |

### 1.15 Testes negativos por papel

| Passo | Perfil | O que fazer | O que deve acontecer |
| --- | --- | --- | --- |
| 1 | Tesoureiro A | Pessoas: lista e perfil | Vê, mas sem cadastro rápido, sem editar seções, sem ⋯ de ciclo de vida, sem Importar |
| 2 | Tesoureiro A | Digitar `/app/pessoas/importar` na barra | Tela de sem permissão, com o nome da permissão |
| 3 | Tesoureiro A | Famílias › abrir uma família | Só leitura, sem as ações de gestão |
| 4 | Tesoureiro A | Configurações | Não aparece; `/app/configuracoes/usuarios` mostra sem permissão |
| 5 | Secretário A | Menu Financeiro e Cadastro | Não aparecem; URL direta mostra sem permissão |
| 6 | Secretário A | Perfil da pessoa | Sem a aba Contribuições |
| 7 | Secretário A | Configurações › Usuários, Perfis, Auditoria, Acesso do suporte | Não aparecem |
| 8 | Secretário A | Painel | Sem os cartões financeiros |

### 1.16 Auditoria e aba Histórico

Perfil: Pastor A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Configurações › Auditoria: filtros no Sheet (período, autor, módulo, ação, pessoa) [celular] | Lista paginada; filtros na URL |
| 2 | Abrir uma linha | Sheet com alterações (antes → depois), pessoas afetadas, IP e dispositivo |
| 3 | Logins, falhas de login, bloqueio e logout | Aparecem com o autor |
| 4 | Exportar CSV | Baixa com o nome do arquivo; a exportação entra no log |
| 5 | Perfil da pessoa › aba Histórico | Só alterações de Pessoas, com autor; "Ver acessos e alterações na Auditoria" abre a Auditoria filtrada pela pessoa |
| 6 | Linhas da equipe iEzer (reenvio de convite, ações do suporte) | Autor "Suporte iEzer" |

### 1.17 Acesso do suporte (lado da igreja)

Fazer junto com a seção 2.8. Perfil: Pastor A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Configurações › Acesso do suporte: pedido de leitura feito pelo iEzer [pastor] | Pedido com motivo, escopo e prazo; "Aprovar" e "Recusar" |
| 2 | Aprovar | Card do acesso ativo; faixa em todas as telas de Configurações; prazo conta daqui |
| 3 | "Revogar" | Acesso encerrado na hora; o atendente perde os dados no próximo clique |
| 4 | Recusar um pedido | Some dos pendentes; quem pediu recebe e-mail (log) |
| 5 | "Autorizar acesso" por iniciativa da igreja | Prazo de 2h a 72h, padrão 24h; o acesso fica ativo na hora |
| 6 | "Revogar" o acesso do passo 5 | Encerrado. Só pode haver um acesso ativo por igreja: sem isso, os passos 2.8-12, 13 e 16 seriam recusados |
| 7 | Pedido com escrita ainda aguardando o iEzer | Não aparece para a igreja |
| 8 | Emergência aprovada pelo iEzer | Aparece ativa, sem "Revogar" |
| 9 | Auditoria filtrada por "Suporte iEzer" | Leituras do atendente com o nome da tela |

### 1.18 Faixa de avisos

Fazer junto com a seção 2.9. Perfis: Pastor A e Secretário A.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Aviso informativo no ar para a igreja A [celular] [pastor] | Faixa azul acima do header, com "Saiba mais" e "X" |
| 2 | Dispensar | Some e não volta ao recarregar |
| 3 | Aviso importante | Faixa vermelha sem "X"; fica até o fim |
| 4 | Dois avisos ao mesmo tempo | Empilhados, o importante em cima |
| 5 | Aviso "só admins" | Pastor vê; Secretário não |
| 6 | Chegar o horário de fim com a tela aberta | A faixa some sozinha |

### 1.19 Tela de igreja suspensa

Fazer junto com a seção 2.6, na igreja B. Perfil: Pastor B2 (o admin recuperado na 2.6).

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Pastor B2 logado quando o iEzer suspende a B | No próximo clique vai para "Igreja suspensa" [celular] |
| 2 | Tentar entrar de novo | Login leva à mesma tela, sem abrir sessão |
| 3 | [depende: Google] Entrar com Google | Volta para a tela de igreja suspensa |
| 4 | Abrir um convite pendente da B | Recusado com o aviso de igreja suspensa |
| 5 | Reativada a B | Login volta a funcionar |

### 1.20 Link público da exportação

Fazer junto com a seção 2.10, na igreja B. Sem login. [depende: chave do Storage no Render]

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Pegar no log o e-mail da exportação pronta (para o responsável pela conta da B; depois da 2.7, o Pastor B2) | Link `/exportacao/<token>` |
| 2 | Abrir o link [celular] | Página com a igreja, o tamanho e o prazo; abrir não gasta o link |
| 3 | "Baixar" | Baixa o `.zip` com um `.xlsx` por conjunto e o LEIA-ME; datas e valores certos no Excel |
| 4 | Abrir o link de novo e clicar em "Baixar" | Já baixado; não baixa outra vez |
| 5 | Link com um caractere trocado | Mensagem de link inválido, sem dados da igreja |

### 1.21 Roteiro do pastor

Só os passos marcados [pastor], em ordem, na conta dele (`hml.pastor@iezer.local`, perfil Pastor na sede). Ele usa o celular para o convite e o 2FA; o resto pode ser no computador.

Antes da sessão, deixe pronto:

- o convite dele criado (1.5-7), com o link copiado do log para mandar por WhatsApp;
- pessoas cadastradas (1.7): membros, visitantes (um para promover) e aniversariantes do mês;
- a família montada (1.9): casal, dois filhos (um menor) e um "Outro"; parentes em outro domicílio (1.10);
- um pedido de acesso de leitura pendente na A, feito pelo Suporte e ainda sem resposta (2.8-2);
- um aviso informativo no ar para a A (2.9);
- um e-mail fictício novo para ele convidar (ex.: `hml.voluntario3@iezer.local`).

| Ordem | Passos | O que ele faz |
| --- | --- | --- |
| 1 | 1.1-2, 1.1-4, 1.1-5, 1.1-10 | Abre o convite no celular, define a senha, aceita os termos, configura o 2FA e olha o Painel: checklist de primeiro acesso, sem a faixa de admin único (ele é o segundo admin) |
| 2 | 1.18-1 | Vê a faixa do aviso e dispensa |
| 3 | 1.4-1 | Confere Configurações › Organização |
| 4 | 1.7-1, 1.7-3 | Pessoas: busca, atalhos e um cadastro rápido de visitante |
| 5 | 1.8-1 | Abre uma pessoa e passa pelas abas |
| 6 | 1.9-1, 1.10-1 | Famílias: lista, página da família e a aba Família da ficha |
| 7 | 1.12-1, 1.12-5 | Promove o visitante e vê os indicadores do Painel |
| 8 | 1.13-1 a 1.13-4 | Importação: baixa o modelo, preenche umas linhas, vê a prévia e confirma |
| 9 | 1.5-1, 1.5-10 | Convida o Voluntário 3 a partir de uma pessoa; desativa e reativa o Secretário A |
| 10 | 1.17-1 | Aprova ou recusa o pedido de acesso do suporte |

---

## Parte 2 — App admin

Local: `npm run dev:admin` (porta 5174). Publicado: URL da Vercel do admin [depende: projeto na Vercel e `ADMIN_WEB_ORIGIN`].
Use o perfil de navegador da equipe; troque de conta quando a seção pedir.

### 2.1 Entrada da equipe

Perfis: Administrador 1; depois cada convidado da seção 2.3.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Administrador 1: login com e-mail, senha e código do app | Entra no Painel; no log, e-mail de login a todos os Administradores ativos |
| 2 | Login com código de recuperação | Entra; o código não vale de novo |
| 3 | Procurar a opção de código por e-mail | Não existe: a equipe só usa app autenticador |
| 4 | Login com a conta do Pastor A | "Esta conta não tem acesso ao back-office do iEzer." e a sessão é encerrada |
| 5 | Convidado: abrir o link do convite da equipe (log ou "Copiar link") [celular] | Página do convite com nome e papéis |
| 6 | Definir senha fraca, depois boa; configurar o app (QR), guardar os códigos ("Guardei"); aceitar o termo da equipe | Só entra depois dos três passos, nesta ordem |
| 7 | Abrir o mesmo convite de novo | Convite já usado |
| 8 | Suporte: olhar o menu | Painel, Igrejas, Pedidos de acesso, Avisos, Minha conta; sem Equipe e Auditoria |
| 9 | Implantação: olhar o menu | Painel, Igrejas, Pedidos de acesso, Minha conta; sem Avisos, Equipe e Auditoria |
| 10 | Implantação: digitar `/equipe`, `/auditoria` e `/avisos` | Volta para o Painel |
| 11 | Suporte: errar a senha 5 vezes e tentar a 6ª | Bloqueio de 15 min; no log, e-mail ao Suporte e a todos os Administradores |
| 12 | Sessão ociosa: [depende: SQL no banco] rodar no Supabase `update "Session" set "lastActiveAt" = now() - interval '13 hours' where "userId" = (select id from "User" where email = 'hml.suporte@iezer.local');` e clicar em qualquer tela | Volta para o login (12h sem uso derrubam a sessão da equipe). Sem o SQL, deixar a sessão parada 12h |
| 13 | "Esqueceu a senha?" | Só orienta a falar com um Administrador iEzer |

### 2.2 Minha conta da equipe

Perfil: Suporte.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Minha conta [celular] | Senha, app autenticador, códigos de recuperação e sessões |
| 2 | Trocar a senha | Senha atual errada recusada; certa troca |
| 3 | "Reconfigurar app" com senha errada, depois certa | Errada recusada; certa pede o QR novo, encerra as outras sessões e manda alerta (log) |
| 4 | Novos códigos de recuperação | Os antigos param de valer |
| 5 | Encerrar outra sessão | A outra cai no próximo clique |

### 2.3 Equipe

Perfil: Administrador 1 (o 2 depois que existir).

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Equipe › Convidar o Administrador 2 (marcar Administrador) | Os outros papéis aparecem marcados e travados; convite pendente |
| 2 | Convidar Suporte e Implantação | Convites pendentes; links no log |
| 3 | Convidar um e-mail de usuário de igreja (ex.: `hml.pastor.a@iezer.local`) | Recusado |
| 4 | Convidar de novo um e-mail com convite pendente | Recusado |
| 5 | "Copiar link novo", "Reenviar" e "Cancelar" num convite de teste | Link antigo deixa de valer; cancelado some |
| 6 | Mudar os papéis do Suporte (adicionar Implantação, depois tirar) | Menu dele muda depois de recarregar |
| 7 | Procurar o menu na própria linha | Não tem: ninguém altera os próprios papéis nem se desativa |
| 8 | Desativar o Suporte com ele logado | Ele cai; login recusado. Reativar devolve o acesso |
| 9 | "Redefinir autenticador" do Suporte | No próximo login ele configura o app de novo |
| 10 | [depende: segundo Administrador] Administrador 2 tira o papel de Administrador do 1 e devolve | Funciona. A trava "nunca sem Administrador ativo" não dá para provocar pela tela: quem age é sempre outro Administrador ativo |
| 11 | Tabela vira cards abaixo de 768px [celular] | Ações no menu do card |

### 2.4 Painel de saúde

Perfil: qualquer papel. O painel guarda cache de 2 minutos: recarregue depois disso.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Abrir o Painel [celular] | Sete cartões, com contagem e nomes de igreja; nunca nome de pessoa |
| 2 | Igreja B antes do Pastor B aceitar | B em "Sem administrador" |
| 3 | Igreja A com só o Pastor A | A em "Com um administrador só". Depois da sessão do pastor (1.21), conferir que a A saiu desse cartão |
| 4 | Login bloqueado na A (1.2-2) | A em "Com login bloqueado agora"; clicar abre a aba Usuários |
| 5 | Pedido de acesso pendente (2.8) | Igreja em "Com pedido de acesso pendente"; clicar abre a aba Pedidos |
| 6 | E-mail rejeitado (2.12) | Igreja em "E-mails rejeitados nos últimos 7 dias" |
| 7 | "Em Implantação há mais de 15 dias" e "Sem nenhum acesso há 30 dias" | [depende: tempo] Só aparecem com igrejas antigas; conferir se alguma igreja de teste antiga está lá |

### 2.5 Igrejas

Perfis: Implantação (criar e editar), Suporte (ações sem acesso aos dados).
Os passos 1 a 7 vêm antes da Parte 1. Os passos 8 a 16 dependem dela: faça-os depois da seção 1.5 (e o 12 depois do 1.2-2).

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Igrejas: busca por nome e CNPJ, filtro por situação [celular] | Lista com situação; cards no celular |
| 2 | Implantação: "Nova igreja" A com a congregação, contatos e o primeiro admin (seção 0.5) | Nasce em Implantação; convite do Pastor A no log |
| 3 | Nova igreja com o mesmo CNPJ | Recusado, com link para a igreja que já tem |
| 4 | CNPJ com dígito errado; CNPJ alfanumérico válido | Errado recusado no campo; alfanumérico aceito |
| 5 | Primeiro admin com e-mail da equipe ou de outra igreja | Recusado no campo |
| 6 | Criar a igreja B (sem congregação) | Nasce em Implantação |
| 7 | Suporte: abrir "Nova igreja" | Não tem o botão; `/igrejas/nova` volta para o Painel |
| 8 | Visão geral: editar sede e contatos (responsável: só cargo, e-mail e telefone) | Salva; a troca da pessoa é pela seção 2.7 |
| 9 | Aba Congregações: criar, renomear | Aparece no seletor do Pastor A |
| 10 | Aba Usuários | Só nome, e-mail, perfis, status, último acesso, marcas de bloqueio e de e-mail rejeitado; nada de dados da pessoa |
| 11 | Suporte: "Reenviar convite" do admin pendente (B), com motivo e chamado | Convite novo no log; o link não aparece na tela; responsável avisado (log) |
| 12 | Suporte: "Destravar login" do usuário bloqueado em 1.2-2 | Destravado; responsável avisado; sem bloqueio, a ação não aparece |
| 13 | Suporte: "Redefinir 2FA" do Pastor A, com motivo, chamado e verificação | 2FA apagado, sessões do Pastor encerradas, alerta a ele e aviso ao responsável |
| 14 | "Redefinir 2FA" de um não admin (Secretário) | A ação não aparece |
| 15 | "Recuperar administrador" | Testado na 2.6-9, quando a B fica sem admin |
| 16 | Auditoria da igreja A (Pastor A) | As ações acima com autor "Suporte iEzer", motivo e chamado |

### 2.6 Situação

Perfil: Administrador 1 (Suporte no passo 9). Pastor B2 logado em outro navegador nos passos 11 e 12 (seção 1.19).
**Antes do passo 5**, faça os passos 9 a 11 da seção 2.8: eles precisam da A Ativa e da B ainda em Implantação.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Suporte e Implantação: card "Situação" | Implantação vê só "Marcar como ativa" (igreja em Implantação); Suporte, nenhuma ação. Suspender e Reativar são só do Administrador |
| 2 | Igreja A, com o Pastor A já ativo: "Marcar como ativa" com motivo | A Ativa; e-mails no log |
| 3 | Igreja B, antes do Pastor B aceitar o convite | "Marcar como ativa" desabilitado (sem admin ativo) |
| 4 | Pastor B aceita o convite (1.1 com a conta dele) | Botão habilitado |
| 5 | "Marcar como ativa" a B com motivo | B Ativa |
| 6 | Pastor B, no app das igrejas: Configurações › Usuários › convidar o Secretário B (`hml.secretario.b@iezer.local`, perfil Secretário na sede); ele aceita no seu perfil de navegador | Secretário B ativo |
| 7 | Secretário B: Pessoas › ficha do Pastor B › "Desligar do rol" (o Pastor B é o único admin da B) | Acesso do Pastor B suspenso na hora. No log, e-mail à equipe (Suporte e Administradores) de igreja sem admin, sem nome nem situação da pessoa. No Painel (depois do cache), a B em "Sem administrador" |
| 8 | Opcional: Secretário B tenta "Desligar do rol" a própria ficha | Se o app bloquear, anotar como dúvida (não como achado). Se deixar, o acesso dele é suspenso; não atrapalha os passos seguintes |
| 9 | Suporte: aba Usuários da B › "Recuperar administrador" com o Pastor B2 (`hml.pastor.b2@iezer.local`), motivo, chamado e verificação | Convite de admin criado; o link não aparece na tela (pegar no log); responsável avisado |
| 10 | Pastor B2 aceita o convite (1.1 com a conta dele) | B sai de "Sem administrador" no Painel |
| 11 | "Suspender" a B com motivo | B Suspensa; sessões da igreja derrubadas; Pastor B2 vê a tela de suspensa |
| 12 | "Reativar" | B Ativa; Pastor B2 entra de novo (sem admin ativo, voltaria para Implantação) |

### 2.7 Troca do responsável pela conta

Perfil: Implantação (ou Administrador), na igreja B. [depende: chave do Storage no Render; local, com `SUPABASE_SERVICE_ROLE_KEY` no `.env`]

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Visão geral › responsável › "Trocar", sem anexo | Recusado |
| 2 | Documento com data futura | Recusado |
| 3 | Anexo acima de 10 MB; PDF falso | Recusados (tipo conferido pelo conteúdo) |
| 4 | Mesmo responsável de hoje | Recusado |
| 5 | Novo responsável: o Pastor B2 (`hml.pastor.b2@iezer.local`), ata com número, PDF pequeno [celular] | Barra de progresso; troca feita; e-mails ao anterior (Pastor B), ao novo e aos admins (log) |
| 6 | "Histórico de responsáveis" › abrir o documento | Abre numa aba nova; abertura registrada na Auditoria |
| 7 | Copiar o link do documento e abrir depois de 5 minutos | Link vencido |
| 8 | Suporte: procurar "Trocar" e abrir documento | Não aparecem |

### 2.8 Pedidos de acesso e modo suporte

Perfis: Suporte, Implantação, Administradores 1 e 2; Pastor A no app das igrejas (seção 1.17).

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Suporte, sem pedido: abrir o app das igrejas com a conta dele | Tela de conta da equipe sem acesso, com o link do back-office e Sair |
| 2 | Suporte: igreja A › Pedidos de acesso › "Pedir acesso" só leitura, escopo Pessoas, com chamado | `PENDENTE`; admins da A avisados (log); aparece para o Pastor A |
| 3 | Pastor A aprova (1.17-2); Suporte › "Abrir no modo suporte" | Aba nova no app das igrejas (em produção, pede login de novo); faixa fixa com igreja, modo e prazo, "Voltar ao back-office" |
| 4 | Modo leitura: navegar em Pessoas [celular] | Sem criar, editar nem excluir; sem coluna Contato; telefone e e-mail como texto, sem "Ligar"/"WhatsApp" |
| 5 | Modo leitura: Configurações › Perfis e Organização | Sem botões de gestão |
| 6 | Pastor A revoga (1.17-3) | O atendente cai na tela de conta sem acesso no próximo clique |
| 7 | Suporte: pedido com escrita | `AGUARDANDO_IEZER`; não aparece para a igreja; Administradores avisados (log) |
| 8 | Suporte tenta aprovar o próprio pedido | Sem "Aprovar"; quem pediu nunca aprova |
| 9 | Implantação (só): pedido com escrita | Sem o switch de escrita |
| 10 | Implantação: pedido de leitura na A (já Ativa, 2.6-2) | Recusado: só igreja em Implantação |
| 11 | Implantação: pedido de leitura na B ainda em Implantação (antes da 2.6-5) | Aceito, `PENDENTE` |
| 12 | [depende: segundo Administrador] Administrador 1 pede com escrita; Administrador 2 aprova | Vai para a igreja (`PENDENTE`); quem pediu recebe e-mail |
| 13 | Pastor A aprova; atendente edita uma pessoa no modo suporte | Grava; na Auditoria da A, autor "Suporte iEzer" |
| 14 | Modo escrita: criar perfil ou congregação | Recusado (Acesso e Organização nunca recebem escrita do suporte) |
| 15 | "Encerrar" o pedido ativo pelo admin | Acesso cai na hora |
| 16 | [depende: segundo Administrador] Suporte abre "Emergência"; Administrador 2 aprova | Ativo na hora; responsável e admins avisados; igreja vê sem "Revogar" |
| 17 | Emergência com outro pedido ativo na igreja | Recusado |
| 18 | Administrador recusa um pedido com escrita | `RECUSADO`; quem pediu recebe e-mail |
| 19 | "Cancelar" um pedido pendente | `CANCELADO` |
| 20 | Pedidos de acesso (menu): pílulas de situação [celular] | Filtra; a situação fica na URL |
| 21 | Pedido pendente com 7 dias sem resposta | [depende: tempo] Aparece como Expirado |
| 22 | Pedido para a B suspensa (durante a 2.10) | Recusado: igreja suspensa |

### 2.9 Avisos

Perfis: Administrador 1 e Suporte; igreja A no app das igrejas (seção 1.18).

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Suporte: Avisos | Lista e "Ver aviso"; sem criar nem editar |
| 2 | Administrador: novo aviso informativo, todas as igrejas, com link `http://` | Link recusado: só `https` |
| 3 | Salvar como rascunho; prévia da faixa no dialog [celular] | Rascunho na lista |
| 4 | Apagar o rascunho | Some |
| 5 | Aviso de manutenção agendado para daqui a 5 min, igreja escolhida A, com e-mail | Agendado; entra no ar no horário; e-mail aos admins e ao responsável uma vez (log) |
| 6 | Editar o agendado; tentar editar um no ar | Agendado edita; no ar não |
| 7 | Aviso importante para "só admins" das igrejas Ativas | Só o Pastor A vê |
| 8 | Fim no passado | Recusado |
| 9 | "Encerrar" um no ar | Some da igreja; status Encerrado |
| 10 | Contagens de vistos e dispensados | Batem com o que foi feito na 1.18 |
| 11 | Público "por situação" | Só oferece Implantação e Ativa (igreja suspensa não vê avisos) |

### 2.10 Fim de contrato

Perfil: Administrador 1, na igreja B. [depende: chave do Storage no Render]

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Igreja A (Ativa): Visão geral | Sem o card "Fim de contrato" |
| 2 | "Suspender" a B de novo (como na 2.6-11) | Card "Fim de contrato" aparece |
| 3 | Suporte e Implantação: card | Sem "Exportar dados" nem "Registrar eliminação" |
| 4 | "Exportar dados" | Andamento "Processando" e depois "Disponível"; o link vai só ao responsável (log, seção 1.20); a tela nunca mostra link nem arquivo |
| 5 | Pedir outra exportação enquanto uma processa | Recusado |
| 6 | Pedir outra com uma disponível e não baixada | A anterior vira "Substituída"; o link antigo deixa de valer |
| 7 | "Registrar eliminação" com anexo inválido (PDF falso) | Recusado pelo tipo do arquivo |
| 8 | "Registrar eliminação" com PDF certo, ainda com a exportação à espera do download | Recusado: há exportação disponível |
| 9 | Responsável baixa (1.20-3); pedir outra exportação | "Baixada"; nova exportação recusada |
| 10 | "Registrar eliminação" de novo | Recusado, com a lista do que ainda falta apagar no banco |
| 11 | **Não rodar** o `docs/roteiro-eliminacao.md` na homologação | A B termina Suspensa |

### 2.11 Auditoria interna e Histórico da igreja

Perfis: Administrador 1; Suporte para o passo 5.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Auditoria: filtros por membro, igreja, ação e período [celular] | Lista paginada; filtros na URL |
| 2 | Logins da equipe, convites, papéis, avisos | Linhas sem igreja, módulo Back-office |
| 3 | Linha de dado de igreja (edição no modo suporte, leitura do suporte) | Sem pessoas nem alterações; o detalhe diz que fica só na Auditoria da igreja |
| 4 | Igreja A › aba Histórico | Ações da equipe e do sistema na A; filtros só para o Administrador |
| 5 | Suporte: aba Histórico; `/auditoria` | Histórico sem filtros; `/auditoria` volta para o Painel |

### 2.12 E-mail rejeitado (webhook do Resend)

Perfil: Suporte, igreja B.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | [depende: Resend com domínio] Mandar um convite para um endereço que não existe num domínio real | O Resend rejeita; aba Usuários da igreja mostra a marca de e-mail rejeitado; painel com o alerta |
| 2 | Simulação local: pôr no `.env` um `RESEND_WEBHOOK_SECRET=whsec_<base64 qualquer>`, reiniciar o back e rodar o comando abaixo com o e-mail de um usuário da B | `200 {"received":true}`; a marca aparece na aba Usuários e a B no painel (depois do cache) |
| 3 | Rodar de novo o mesmo comando trocando um caractere da assinatura | `401 INVALID_SIGNATURE` |
| 4 | Sem `RESEND_WEBHOOK_SECRET` | `503 WEBHOOK_UNAVAILABLE` |

Comando da simulação (grava um `EmailEvent` no banco; troque `SECRET`, `EMAIL` e, no Render, a `URL`):

```bash
SECRET='whsec_...' EMAIL='hml.pastor.b@iezer.local' URL='http://localhost:3333/api/webhooks/resend' node -e '
const { createHmac, randomUUID } = require("node:crypto");
const body = JSON.stringify({ type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: randomUUID(), to: [process.env.EMAIL] } });
const id = "msg_" + randomUUID();
const ts = Math.floor(Date.now() / 1000).toString();
const key = Buffer.from(process.env.SECRET.replace(/^whsec_/, ""), "base64");
const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
fetch(process.env.URL, { method: "POST", headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": "v1," + sig }, body })
  .then(async (r) => console.log(r.status, await r.text()));
'
```

Para `email.complained` (marcado como spam), troque o `type`.

---

## Achados

Gravidade: **bloqueia** (impede a jornada ou expõe dado), **incomoda** (dá para seguir, mas confunde ou atrasa), **cosmético**.

| ID | App | Tela | Passo | Esperado | Obtido | Gravidade | Desktop ou celular |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

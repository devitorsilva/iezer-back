# Roteiro mínimo de homologação

Versão enxuta do `docs/homologacao.md`. Cobre só as jornadas que a igreja piloto vai usar no dia a dia, no navegador, com dados fictícios.
O roteiro completo continua valendo como referência para os outros dois grupos:

| Grupo | O que é | Onde fica |
| --- | --- | --- |
| **A. Navegador** (este roteiro) | Jornadas da piloto, ~70 passos | Aqui |
| **B. Testes automáticos** | Regras e recusas (validações, travas, permissões, estados) | Sprint própria do Claude Code, com banco só de testes |
| **C. Adiado** | Recursos que a piloto não usa no começo | Testar antes do go-live ou do primeiro uso real (lista no fim) |

**Marcas:** **[celular]** = conferir também no modo responsivo do Safari (Desenvolvedor › Modo de Design Responsivo, 375 px). **[pastor]** = entra na sessão com o pastor (seção M10).

---

## Já feito (30/10/2026)

- Equipe iEzer: `admin@iezer.local` (Administrador 1), `hml.admin2` (Administrador 2), `hml.suporte` (Suporte), `hml.implantacao` (Implantação), todos com app autenticador. Testados: convite, aceite, menu por papel, desativar e reativar, redefinir autenticador, bloqueio por senha errada, mudar papéis, Minha conta (senha, reconfigurar app, novos códigos, sessões).
- Igrejas criadas pela Implantação, em Implantação: **A** "Igreja Homologação Alfa" (CNPJ 14.022.026/0001-45, Congregação Alfa Norte, convite do `hml.pastor.a` pendente) e **B** "Igreja Homologação Beta" (CNPJ 14.022.027/0001-90, convite do `hml.pastor.b` pendente).
- Recusas da Nova igreja (CNPJ repetido, inválido, e-mail da equipe), busca e filtro de Igrejas, Painel com as duas em "Sem administrador".
- Achados A1 a A15 e ajustes R1 e R2 enviados ao Claude Code (lote 1).
- M1, M2 e M3-1 a M3-5 percorridos e lote 1 retestado; achados A16 a A29 enviados ao Claude Code (lote 2).

## Preparação

- **Perfis de navegador:** no localhost, o app das igrejas (5173) e o admin (5174) dividem o cookie. Use um perfil de navegador por pessoa logada ao mesmo tempo: os perfis da equipe que já existem, mais "Pastor A" e "Secretário A". Tesoureiro e Secretário Norte podem usar a janela privada, trocando de conta.
- **E-mails:** sem domínio no Resend, convites e códigos aparecem no terminal do back.
- **Dados fictícios:** CPFs válidos `140.220.261-03` e `140.220.262-86`; e-mails `@iezer.local`.
- **iPhone de verdade:** o localhost não abre no celular. Os passos [celular] usam o modo responsivo; o teste no iPhone real (teclado e zoom nos campos) fica para quando a homologação estiver publicada na Vercel.

---

## M1. Entrada da igreja — Pastor A

Perfil de navegador "Pastor A". Origem: 1.1.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M1-1 | Abrir o link do convite do `hml.pastor.a` [celular] | Igreja Alfa, convidado pela "Equipe iEzer", perfil Pastor na sede |
| M1-2 | Tentar a senha vazada `Senha123456789`; depois uma senha boa, marcar os termos e aceitar | A vazada é recusada sem apagar o campo; a boa leva à configuração do 2FA |
| M1-3 | Configurar o 2FA pelo app autenticador e guardar os códigos de recuperação | Código aceito; códigos exibidos; chega ao Painel. Pelo código por e-mail não há códigos de recuperação (só o app gera) |
| M1-4 | Olhar o Painel | Checklist de primeiro acesso e a faixa de admin único |
| M1-5 | Sair e entrar de novo (senha + código do app) | Entra no Painel |

## M2. Ativar a igreja A — Administrador 1

Origem: 2.6-2.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M2-1 | Admin › Igrejas › Alfa › Situação › "Marcar como ativa", com motivo | Alfa fica Ativa; sai de "Sem administrador" no Painel (cache de 2 min) |

## M3. Organização e equipe da igreja — Pastor A

Origem: 1.4, 1.5.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M3-1 | Configurações › Organização | Sede e Congregação Alfa Norte; responsável pela conta só leitura |
| M3-2 | Usuários › Convidar o Secretário A (`hml.secretario.a`) a partir de uma pessoa nova, pelo cadastro rápido dentro do fluxo, perfil Secretário na sede | "Cadastrar pessoa" fica logo abaixo do campo Pessoa; convite pendente; resumo do acesso em linguagem natural |
| M3-3 | Convidar o Tesoureiro A (`hml.tesoureiro.a`), perfil Tesoureiro na sede | Convite pendente |
| M3-4 | Convidar o Secretário Norte (`hml.secretario.norte`), perfil Secretário **só na Congregação Alfa Norte** | O resumo cita só a Alfa Norte |
| M3-5 | Convidar o pastor de verdade (`hml.pastor@iezer.local`), perfil Pastor na sede. **Não aceitar agora**: o link fica para a sessão com ele | Convite pendente |
| M3-6 | Secretário A, Tesoureiro A e Secretário Norte aceitam, cada um no seu perfil de navegador | Entram sem 2FA obrigatório; aceitam os termos |

## M4. Pessoas — Secretário A

Origem: 1.7, 1.8.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M4-1 | Cadastro rápido de um visitante [celular] [pastor] | Pede só o mínimo do vínculo |
| M4-2 | Cadastrar outra pessoa com o mesmo celular | Aviso de possível duplicado, com link; dá para seguir |
| M4-3 | Cadastrar duas pessoas com o CPF `140.220.261-03` | A segunda é bloqueada |
| M4-4 | Cadastrar uma criança escolhendo o responsável e marcando o consentimento | Criada e já na família do responsável |
| M4-5 | Lista: busca, atalhos (Membros, Visitantes, Aniversariantes) e filtros no Sheet [celular] [pastor] | Cards no celular; filtros na URL; voltar do perfil mantém tudo |
| M4-6 | Abrir uma pessoa e passar pelas abas [celular] [pastor] | Sem Contribuições nem Acesso para o Secretário |
| M4-7 | Editar Contato e endereço com CEP | Preenche rua, bairro, cidade e UF; salva só a seção |
| M4-8 | Pessoa com cadastro incompleto | Aviso "Cadastro incompleto"; a ação abre a seção que falta |

## M5. Família e parentes — Secretário A

Origem: 1.9, 1.10. Monte um domicílio com casal, dois filhos (um menor) e um "Outro".

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M5-1 | Pessoas › Famílias: buscar pelo nome de um membro e abrir a família [celular] [pastor] | Estrela no contato principal; relações em texto ("filho de… e …") |
| M5-2 | "Adicionar pessoa" com um nome que não existe › "Cadastrar nova pessoa" | Cadastro rápido com o nome e o papel; "Usar o endereço do domicílio" marcado |
| M5-3 | "Atualizar endereço" | Muda só os membros marcados |
| M5-4 | Remover o contato principal | A estrela vai para o próximo adulto |
| M5-5 | Na ficha de um adulto: "Cadastrar filho" | Criança no domicílio e ligada como filho |
| M5-6 | "Adicionar parente": a mãe do adulto, que mora em outro domicílio | Aparece "mãe de…" com link para a ficha |
| M5-7 | Abrir a ficha do neto | Avó e irmãos aparecem em texto [pastor] |
| M5-8 | Remover o responsável do menor da família | Recusado: o menor ficaria sem responsável |

## M6. Ciclo de vida e Painel — Secretário A

Origem: 1.12.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M6-1 | ⋯ "Promover vínculo": o visitante do M4-1 até membro [pastor] | Pede só o que falta; evento na linha do tempo |
| M6-2 | "Registrar acompanhamento" pela linha da lista [celular] | Entra na linha do tempo |
| M6-3 | Painel: indicadores da jornada [pastor] | Contadores batem; clicar abre Pessoas filtrada |

## M7. Importação — Secretário A

Origem: 1.13. Seletor numa organização (não "Todas").

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M7-1 | Pessoas › Importar › baixar o modelo [pastor] | `.xlsx` com as listas suspensas |
| M7-2 | Preencher: uma linha certa, uma com data inválida, uma duplicada (mesmo celular de alguém) e um menor sem responsável | Listas suspensas funcionam |
| M7-3 | Enviar | Prévia com cada caso explicado; nada gravado ainda |
| M7-4 | "Atualizar" o duplicado, marcar a declaração e confirmar [pastor] | Relatório; o CSV baixa |
| M7-5 | Repetir com o editor de planilha que a piloto usa (Excel, Numbers ou Google Planilhas), exportando em `.xlsx` | Prévia funciona |

## M8. Financeiro — Tesoureiro A

Origem: 1.14.

| Passo | O que fazer | O que deve acontecer |
| --- | --- | --- |
| M8-1 | Contas a Receber › nova receita com a pessoa pelo PersonPicker | Busca no servidor; salva |
| M8-2 | "Baixar" a receita | Situação muda |
| M8-3 | Abrir a pessoa › aba Contribuições | O lançamento aparece |

## M9. Quem vê o quê

Origem: 1.11, 1.15. É a parte de privacidade: qualquer falha aqui **bloqueia**.

| Passo | Perfil | O que fazer | O que deve acontecer |
| --- | --- | --- | --- |
| M9-1 | Tesoureiro A | Pessoas e Famílias | Vê, sem cadastrar, editar, ciclo de vida nem Importar |
| M9-2 | Tesoureiro A | Digitar `/app/configuracoes/usuarios` | Tela de sem permissão |
| M9-3 | Secretário A | Menu e perfil da pessoa | Sem Financeiro, sem aba Contribuições, sem Configurações › Usuários e Perfis |
| M9-4 | Secretário A | Antes: cadastrar na Alfa Norte o "Norte Um", pô-lo no domicílio da sede do M5 e ligá-lo como filho de um adulto da sede; copiar a URL da ficha de uma pessoa da sede | — |
| M9-5 | Secretário Norte | Seletor e lista de Pessoas | Só a Alfa Norte; pessoas da sede não aparecem nem no PersonPicker |
| M9-6 | Secretário Norte | Colar a URL da pessoa da sede | "Não encontrado", sem nenhum dado |
| M9-7 | Secretário Norte | Ficha do Norte Um › Família e Parentes | Membros e parentes da sede só com nome; sem contato, endereço nem link |

## M10. Usuários e suporte — Pastor A e equipe

Origem: 1.5, 1.6, 1.17, 2.8.

| Passo | Perfil | O que fazer | O que deve acontecer |
| --- | --- | --- | --- |
| M10-1 | Pastor A | Desativar o Secretário A com ele logado; reativar | Ele cai no próximo clique; depois volta a entrar [pastor] |
| M10-2 | Pastor A | Perfis › tirar "Gerenciar perfis" do perfil Pastor (só ele é admin ativo) | Bloqueado: a igreja ficaria sem admin |
| M10-3 | Suporte | Igreja A › Pedidos de acesso › "Pedir acesso" só leitura, escopo Pessoas, com chamado | Pendente; aparece para o Pastor A |
| M10-4 | Pastor A | Configurações › Acesso do suporte › Aprovar [pastor] | Acesso ativo, com a faixa |
| M10-5 | Suporte | "Abrir no modo suporte" e navegar em Pessoas | Faixa fixa; sem criar nem editar |
| M10-6 | Pastor A | "Revogar"; depois Auditoria filtrada por "Suporte iEzer" | O atendente perde o acesso no próximo clique; as leituras aparecem com o nome da tela |

## M11. Sessão com o pastor

Antes, deixe pronto: pessoas cadastradas (M4), família montada (M5), um visitante para promover, a planilha do M7, um pedido de acesso pendente do Suporte (como no M10-3) e o link do convite do M3-5.

| Ordem | O que ele faz | Origem |
| --- | --- | --- |
| 1 | Abre o convite no celular dele, cria a senha e configura o 2FA | M1 (no Painel, sem a faixa de admin único) |
| 2 | Pessoas: busca, atalhos e um cadastro rápido | M4-1, M4-5 |
| 3 | Abre uma pessoa e uma família | M4-6, M5-1, M5-7 |
| 4 | Promove o visitante e olha os indicadores | M6-1, M6-3 |
| 5 | Baixa o modelo, preenche umas linhas e importa | M7-1, M7-4 |
| 6 | Desativa e reativa o Secretário A | M10-1 |
| 7 | Aprova o pedido de acesso do suporte | M10-4 |

---

## Grupo C: adiado

Testar antes do go-live ou na primeira vez que for usado de verdade. Seções do roteiro completo:

- Login com Google (1.2-7 a 9);
- Minha conta da igreja: troca de e-mail e de senha (1.3);
- Perfis personalizados: duplicar e prévia (1.6);
- Criar e desativar congregação (1.4-2 a 5);
- Auditoria da igreja: filtros e exportação (1.15);
- Avisos em massa (1.17, 2.9);
- Igreja suspensa, troca do responsável e fim de contrato (1.18 a 1.20, 2.6-6 em diante, 2.7, 2.10);
- Pedidos com escrita e emergência (2.8-7 em diante);
- Auditoria interna e Histórico da igreja (2.11);
- E-mail rejeitado pelo webhook (2.12) e sessão ociosa da equipe (2.1-12).

## Achados

Gravidade: **bloqueia**, **incomoda**, **cosmético**. Os de A1 a A15 e os ajustes R1 e R2 foram enviados ao Claude Code no lote 1; A16 a A29, no lote 2.

| ID | App | Tela | Passo | Achado | Gravidade | Situação |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | admin | Diálogos de confirmação | 2.3-5 | "Cancelar" e "Cancelar convite" se confundem | cosmético | lote 1 |
| A2 | admin | Configurar app autenticador | 2.1-6, 2.3-9 | Pede a senha de novo logo depois de digitá-la | incomoda | lote 1 |
| A3 | admin | Login | 2.3-8 | Equipe desativada vê "fale com o administrador da sua igreja" | incomoda | lote 1 |
| A4 | back | Alertas de conta | 2.3-9, 2.2-2, 2.1-11 | Texto e assinatura das igrejas para conta da equipe | incomoda | lote 1 |
| A5 | admin | Bloqueio de login | 2.1-11 | Manda usar "Esqueci minha senha", que não existe no admin | incomoda | lote 1 |
| A6 | admin | Equipe › convite | 2.3-5 | "Copiar link novo" → "Gerar novo link" | cosmético | lote 1 |
| A7 | admin | Ações assíncronas e Sair | 2.3-5, 2.2-4 | Sem retorno imediato no clique | incomoda | lote 1 |
| A8 | admin | Tela sem o papel | 2.3-10 | 403 aparece como "falha na conexão" | incomoda | lote 1 |
| A9 | back | Mudar papéis | 2.3-10 | Transação expirou (intermitente) | bloqueia (a confirmar) | lote 1 |
| A10 | admin | Erros | 2.3-10 | Erro técnico do Prisma em inglês na tela | incomoda | lote 1 |
| A11 | admin | Trocar senha | 2.2-2 | Campo "Senha" em vez de "Nova senha" | cosmético | lote 1 |
| A12 | admin | Sessão caída | 2.2-5 | Telas em cache continuam abrindo | incomoda | lote 1 |
| A13 | admin | Formulários longos | 2.5-3 | Não rola até o campo com erro | cosmético | lote 1 |
| A14 | admin | Página da igreja | 2.5-6 | "0 congregação(ões)" | cosmético | lote 1 |
| A15 | admin | Listas com busca | 2.5-1 | Sem indicação de carregamento na busca | incomoda | lote 1 |
| R1 | back | Login da equipe | — | E-mail só em dispositivo ou local novo | requisito | lote 1 |
| R2 | back | Contatos da conta | — | E-mail da equipe não pode ser responsável nem encarregado de LGPD | requisito | lote 1 |
| A16 | os dois | Botões com carregamento | vários | Texto parado ("Salvar") em vez do gerúndio ("Salvando") | cosmético | lote 2 |
| A17 | back | E-mail de bloqueio ao membro da equipe | 2.1-11 | "Espere 15 minutos" errado da segunda série em diante | cosmético | lote 2 |
| A18 | admin | Contatos da conta e troca do responsável | — | Erro de e-mail da equipe (R2) no topo do diálogo, não no campo | cosmético | lote 2 |
| A19 | admin | Nova igreja | — | Com mais de um problema, só o primeiro é apontado | cosmético | lote 2 |
| A20 | os dois | Trocar senha | — | "Confirme a senha" → "Confirme a nova senha" | cosmético | lote 2 |
| A21 | os dois | "Gerar novo link" | — | Abre como "Gerando link" e depois troca título, texto e layout | cosmético | lote 2 |
| A22 | igrejas | Painel | M1-4 | Cartões, faixa de vencidas, sino e outros blocos com dados fictícios | bloqueia | lote 2 |
| A23 | igrejas | Painel › Primeiros passos | M1-4 | "Importar a planilha de pessoas (em breve)" ignora a importação | incomoda | lote 2 |
| A24 | igrejas | Verificação em duas etapas | — | Diz "Enviamos um código", mas o código só sai no clique | incomoda | lote 2 |
| A25 | igrejas | Verificação em duas etapas | — | Oferece app e códigos de recuperação a quem só tem o e-mail | incomoda | lote 2 |
| A26 | os dois | Diálogos com gravação | — | Campos, "Cancelar" e X ativos durante o envio | incomoda | lote 2 |
| A27 | igrejas | Usuários › Dar acesso | M3-2 | Carregamento termina e o modal volta ao início antes do link | incomoda | lote 2 |
| A28 | igrejas | Cadastro de pessoa | M3-2 | Celular sem o 9 recusado com motivo errado, erro no topo e no campo | cosmético | lote 2 |
| A29 | igrejas | Usuários › listas | M3-4 | Perfil sem a organização ("Secretário" na sede e na Norte iguais) | incomoda | lote 2 |
|  |  |  |  |  |  |  |

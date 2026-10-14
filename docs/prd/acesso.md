# PRD — Acesso: autenticação, usuários, perfis e permissões

> Exportado do Doc em 09/10/2026. O Doc no claude.ai é a fonte de verdade; esta cópia é para o Claude Code ler. Data original: 08/10/2026.


## Contexto e objetivo

O iEzer ainda não tem controle de acesso real, e o MVP de Pessoas só vai para produção depois deste PRD (RF-P01 do [PRD de Pessoas](https://claude.ai/code/artifact/07546a99-1aac-4672-b841-7f75d810b7fe)).

Estado atual, segundo o levantamento de 28/09/2026 (o código não foi reconferido nesta rodada):

- O login é falso: grava um flag no `localStorage`. O botão "Entrar com Google" não autentica.
- O model `User` (id, name, email, passwordHash?) existe sem rota nem tela e não se liga a `Member`.
- O model `Organization` existe sem uso. Nenhuma tabela tem `organizationId`, e o seletor de organização do header é mock.
- O `AuditLog` existe sem uso e sem autor.
- O header mostra "Administrador / admin@iezer.local" fixo. Configurações › Acesso (Autenticação, Integração Email) é só placeholder.

**Objetivo:** garantir que cada pessoa que usa o iEzer entre com a própria conta, veja só o que o perfil dela permite na congregação certa, e que tudo o que acontece com os dados da igreja fique registrado com autor, inclusive o acesso do suporte do iEzer.

**Escopo:** login, convite e primeiro acesso, recuperação de senha, 2FA, sessão, onboarding de uma igreja nova, organizações (sede e congregações), usuários, perfis e permissões, Minha conta, acesso do suporte, audit log e requisitos de LGPD ligados a acesso.

Critérios de sucesso (a calibrar com a igreja piloto):

- Nenhuma rota de dados responde sem usuário autenticado e permissão conferida no servidor.
- A igreja piloto sai do onboarding com pastor, secretaria e tesouraria entrando com as próprias contas, sem apoio técnico além do back-office.
- O perfil Tesoureiro de fábrica não alcança nada além do Financeiro e de ver pessoas e contribuições.
- Todo acesso do suporte do iEzer foi autorizado pela igreja e aparece no log.
- Nenhuma igreja fica sem admin por ação de alguém dentro do sistema.

## Personas

O pastor configura e responde pela igreja; secretaria e tesouraria usam todo dia e trocam com frequência; o suporte do iEzer só entra quando a igreja deixa.

| Persona | O que precisa resolver | O que exige do Acesso |
| --- | --- | --- |
| Pastor (admin) | Dar acesso à equipe, saber quem vê o quê, proteger notas pastorais | Convite simples, perfis de fábrica prontos, resumo em linguagem natural, uso no celular |
| Secretaria | Entrar todo dia, muitas vezes num computador compartilhado | Login rápido, sessão que não fica aberta indefinidamente, recuperação de senha sem depender de ninguém |
| Tesoureiro (voluntário) | Lançar e consultar o financeiro durante o mandato | Acesso só ao que precisa; saída rápida quando o mandato termina |
| Responsável pela conta | Responder pela igreja perante o iEzer (contrato, incidentes, recuperação) | Ser reconhecido pelo suporte quando a igreja fica sem admin ou há conflito interno |
| Suporte do iEzer | Investigar um problema relatado pela igreja | Acesso nominal, autorizado, com prazo e registrado |
| Igreja que contrata | Não ficar refém de um voluntário, não vazar dado sensível, começar rápido | Nunca ficar sem admin, audit log, onboarding assistido |

Três hábitos da realidade brasileira moldam os requisitos: conta compartilhada do tipo "secretaria@igreja" (incompatível com log por autor), e-mail pessoal do Gmail e WhatsApp como o canal que de fato é lido.

## Decisões

Sete decisões vêm do PRD de Pessoas e 21 foram validadas nesta rodada; todas orientam os requisitos abaixo.

### Herdadas do PRD de Pessoas

- **Pessoa é o registro central.** `User` é um acesso opcional ligado a ela (1 pessoa : 0..1 conta).
- **Catálogo fixo de permissões no código:** chave interna, nome amigável, descrição, módulo e flag de protegida.
- **Perfis criados pelo admin de cada igreja.** Um usuário pode ter vários perfis por organização, e as permissões se somam. Perfil na sede vale para todas as congregações.
- **Admin não é perfil especial:** é quem tem "Gerenciar perfis de acesso".
- **Perfis de fábrica por função:** Pastor (acesso total, inclusive notas pastorais), Secretário (cadastro e ciclo eclesiástico, nada financeiro), Tesoureiro (ver pessoas e contribuições).
- **Travas:** protegidas só concedidas por quem as tem; nunca ficar sem admin; toda mudança de permissão no log; perfis de fábrica restauráveis.
- **Back é a fonte de verdade;** notas pastorais e contribuições em endpoints separados.

### Validadas nesta rodada

| # | Decisão | Por quê |
| --- | --- | --- |
| A1 | Login por e-mail e senha e por Google. O e-mail do Google precisa ser o mesmo do convite. Código por WhatsApp fica para a F2 | Cobre o hábito do Gmail sem criar contas soltas; WhatsApp depende da Mensageria |
| A2 | Senha com mínimo de 12 caracteres, sem regras de composição, com bloqueio de senhas vazadas e comuns, sem expiração | Meio-termo pragmático com o NIST 800-63B-4 para voluntários |
| A3 | 2FA obrigatório para quem tem permissão protegida e opcional para os demais. Código por e-mail ou app autenticador. Login com Google **não** dispensa o 2FA do iEzer (revisto na Sprint 12) | Tendência do mercado para papéis com acesso amplo, sem travar quem não é técnico. O Google não informa se a conta tem verificação em duas etapas, e Gmail só com senha daria acesso amplo sem segundo fator |
| A4 | Sessão encerra após 7 dias sem uso. Não há nova pergunta de senha antes de ações críticas | Equilíbrio entre conveniência e computador compartilhado |
| A5 | "Sair de todos os dispositivos" e aviso por e-mail de login em dispositivo novo | Dá ao usuário como reagir a um acesso estranho |
| A6 | Bloqueio temporário progressivo após 5 tentativas erradas, com aviso por e-mail | Contém tentativa de adivinhar senha |
| A7 | Convite sempre a partir de uma Pessoa, com cadastro rápido no mesmo fluxo. E-mail obrigatório para ser usuário | Honra a decisão de Pessoa central |
| A8 | Convite por e-mail com link de uso único, válido por 72h e preso ao e-mail convidado, com botão "copiar link" para WhatsApp | WhatsApp é o canal lido; o link continua seguro mesmo encaminhado |
| A9 | Recuperação de senha por link no e-mail, válido por 1h. Quem perdeu o e-mail pede ao admin para trocar o e-mail e reenviar o convite | Sem dependência do suporte do iEzer no dia a dia |
| A10 | No MVP, o time iEzer cria a igreja num back-office e convida o primeiro admin. Autosserviço com cobrança na F2 | Fase piloto, poucas igrejas, onboarding acompanhado |
| A11 | Responsável pela conta é um contato da organização (nome, cargo, e-mail, telefone), não precisa ser usuário. Só o iEzer troca, mediante documento. Alerta quando houver só um admin | Dá critério ao suporte quando a igreja fica sem admin ou há conflito interno |
| A12 | O Acesso absorve o mínimo de Organizações: sede e congregações (dois níveis), `organizationId` em todas as tabelas e seletor real no header | Tira uma dependência do MVP de Pessoas |
| A13 | O seletor mostra só as organizações onde o usuário tem perfil. Quem tem perfil na sede vê também "Todas as congregações" | Visão consolidada para a liderança da sede |
| A14 | Rol não é acesso: a pessoa é de rol numa congregação e pode ter perfil em outra | Ex.: tesoureiro que serve em outra congregação |
| A15 | Quando a situação da pessoa sai de Ativo (Inativo, Desligado do rol, Falecido, Transferido para fora), o acesso é suspenso na hora, as sessões caem e os admins são avisados | Saída de voluntário sem depender de alguém lembrar |
| A16 | Desativar acesso não mexe na Pessoa. Conta compartilhada é proibida pelos termos de uso | O audit log precisa de um autor real |
| A17 | Suporte do iEzer só acessa dados com autorização de um admin, com prazo (padrão de 24h, máximo de 72h, contado da aprovação; revisto pela B15 do PRD Back-office) e motivo, somente leitura por padrão, nunca notas pastorais, tudo no log visível à igreja e revogável | A igreja é a controladora; o iEzer, operador |
| A18 | Emergência sem autorização só com dupla aprovação interna e aviso imediato ao responsável pela conta | Incidente, ordem judicial ou igreja sem admin |
| A19 | Sem personificação ("ver como usuário X") no MVP. O admin tem uma prévia do que cada perfil vê | Evita que alguém aja em nome de outro |
| A20 | Audit log visível com uma permissão própria, "Ver log de auditoria", dada ao Pastor de fábrica. Leituras registradas: notas pastorais, exportações, impressões e todo acesso do suporte | Prova de quem viu o quê, sem o volume de logar cada visualização |
| A21 | Logs de login guardados por 12 meses; audit log de alterações durante todo o contrato. E-mails transacionais saem do iEzer com o nome da igreja; domínio próprio na F2. "Minha conta" entra no MVP | Marco Civil exige 6 meses; o resto depende da Mensageria |
| A22 | Better Auth como biblioteca de autenticação, usada só para login, senha, Google, 2FA e sessões. Organizações, perfis, permissões, convites e auditoria ficam em tabelas do iEzer | Tabelas no próprio Postgres via Prisma e sem custo por usuário. O plugin de organizações dele não cobre sede → congregações, vários perfis por organização nem permissões protegidas |

## Conceitos do domínio

O acesso de alguém não é um cargo: é a soma das atribuições que essa pessoa tem, cada uma ligando um perfil a uma organização.

Modelo de acesso (diagrama no Doc, transcrito):

```
Pessoa ──0..1──► Usuário ──1..n──► Atribuição (usuário × perfil × organização)
                                      │                 │
                                      ▼                 ▼
                                Organização        Perfil de acesso ──marca──► Permissões
                          (sede ou congregação;   (criado pela igreja)       (catálogo fixo no código)
                           perfil na sede vale
                           para as congregações)
Responsável pela conta: contato da organização, não precisa ser usuário.
```

As permissões efetivas de um usuário numa organização são as de todos os perfis atribuídos a ele ali ou na sede.

### Vocabulário

- **Igreja-cliente:** a sede e suas congregações, que contratam o iEzer juntas.
- **Organização:** a sede ou uma congregação.
- **Usuário:** a conta de acesso de uma Pessoa. No máximo um por pessoa, e o e-mail de login é único no iEzer.
- **Perfil de acesso:** conjunto de permissões criado pela igreja-cliente, usável em qualquer organização dela.
- **Atribuição:** um perfil dado a um usuário numa organização.
- **Permissão protegida:** só quem a tem pode concedê-la, e quem a tem usa 2FA.
- **Admin:** quem tem "Gerenciar perfis de acesso". Não é um perfil.
- **Responsável pela conta:** quem responde pela igreja perante o iEzer (contrato, incidentes, recuperação quando não há admin). Contato da organização, não precisa ser usuário.
- **Acesso do suporte:** a equipe do iEzer vendo dados da igreja, só com autorização e prazo.

### Status do usuário

| Status | Como entra | Efeito |
| --- | --- | --- |
| Convite pendente | Admin deu acesso e o convite não foi aceito | Link válido por 72h |
| Ativo | Convite aceito ou reativação pelo admin | Entra normalmente |
| Desativado | Ação do admin | Não entra; a Pessoa não muda |
| Suspenso | Automático, quando a situação da pessoa sai de Ativo | Não entra; os admins são avisados; volta só por ação do admin |

"Desativar acesso" não é "Desligar do rol" nem "Apagar registro": é só a conta de acesso, e a Pessoa continua como estava (D13 de Pessoas).

## Requisitos funcionais

O módulo tem três superfícies públicas (login, convite, redefinir senha), cinco telas em Configurações (Organização, Usuários, Perfis de acesso, Auditoria, Acesso do suporte), a Minha conta e um back-office interno do iEzer. Todas seguem os padrões do app: tabela vira cards abaixo de `md`, skeleton espelha o layout real, formulários em `Dialog`/`FormField`, dados via React Query.

### Login

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-LG01 | Tela de login com e-mail e senha, "Entrar com Google" e "Esqueci minha senha". Não há "criar conta": só entra quem foi convidado | MVP |
| RF-LG02 | Google só entra se o e-mail da conta Google for de um usuário ativo ou de um convite válido. Caso contrário: "Não encontramos um acesso para este e-mail. Peça um convite ao administrador da sua igreja." | MVP |
| RF-LG03 | Mensagens de erro não revelam se o e-mail existe ("E-mail ou senha incorretos") | MVP |
| RF-LG04 | Quando o 2FA é exigido, uma segunda etapa pede o código de 6 dígitos (e-mail ou app autenticador), com opção de usar um código de recuperação | MVP |
| RF-LG05 | Depois do login, o app abre na última organização usada. Usuário sem perfil em nenhuma organização ativa vê "Você ainda não tem acesso" e o contato do admin | MVP |
| RF-LG06 | Usuário suspenso ou desativado vê "Seu acesso foi desativado. Fale com o administrador da sua igreja." | MVP |
| RF-LG07 | Entrar com código pelo WhatsApp | F2 |

### Convite e primeiro acesso

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-CV01 | "Dar acesso" a partir do perfil da pessoa ou de Configurações › Usuários. Escolha da pessoa pelo `PersonPicker`, com cadastro rápido no mesmo fluxo. O e-mail vem da pessoa e é obrigatório | MVP |
| RF-CV02 | Atribuição em linhas organização × perfis (uma ou várias), com o resumo em linguagem natural das permissões somadas antes de enviar | MVP |
| RF-CV03 | Envio por e-mail com link de uso único, válido por 72h e preso ao e-mail convidado. Botão "Copiar link" para mandar por WhatsApp | MVP |
| RF-CV04 | Convites pendentes listados com status (pendente, expirado). Reenviar invalida o link anterior; cancelar invalida na hora | MVP |
| RF-CV05 | O link abre uma página com o nome da igreja, quem convidou e o resumo do acesso. A pessoa define a senha ou escolhe "Continuar com Google" (mesmo e-mail) | MVP |
| RF-CV06 | No primeiro acesso a pessoa aceita os termos de uso e o termo de confidencialidade (versão registrada no log) | MVP |
| RF-CV07 | Se algum perfil atribuído tem permissão protegida, a configuração do 2FA é obrigatória antes de entrar, também no login pelo Google | MVP |
| RF-CV08 | Convite para um e-mail que já é usuário em outra igreja-cliente do iEzer é recusado com mensagem clara (ver validações) | MVP |

### Recuperação de senha

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-RS01 | "Esqueci minha senha" envia link de uso único válido por 1h. A resposta na tela é a mesma exista ou não o e-mail | MVP |
| RF-RS02 | Redefinir a senha encerra as outras sessões e envia e-mail de confirmação | MVP |
| RF-RS03 | Quem só usa Google pode definir uma senha pelo mesmo fluxo | MVP |
| RF-RS04 | Perdeu o acesso ao e-mail: o admin troca o e-mail da pessoa e reenvia o convite. O e-mail antigo recebe aviso da troca | MVP |
| RF-RS05 | Perdeu o 2FA: o admin redefine o 2FA do usuário (log e aviso por e-mail). Se for o único admin, o caminho é a recuperação pelo responsável pela conta | MVP |

### Onboarding de uma igreja nova

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-OB01 | Back-office interno: o time iEzer cria a conta da igreja com nome da sede, CNPJ, responsável pela conta (nome, cargo, e-mail, telefone), encarregado de LGPD (opcional) e congregações iniciais (opcional) | MVP |
| RF-OB02 | A criação faz o seed dos perfis de fábrica e das listas da igreja (RF-S02 de Pessoas) e cria a Pessoa e o convite do primeiro admin com o perfil Pastor na sede | MVP |
| RF-OB03 | No primeiro acesso, o admin vê um checklist: conferir congregações, convidar um segundo admin, convidar secretaria e tesouraria, importar a planilha de pessoas | MVP |
| RF-OB04 | Enquanto houver só um usuário ativo com "Gerenciar perfis de acesso", um aviso permanente recomenda convidar um segundo | MVP |
| RF-OB05 | Autosserviço: a igreja se cadastra, escolhe o plano e vira a primeira admin | F2 |

### Organizações e seletor

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-OR01 | Configurações › Organização: dados da sede e lista de congregações (criar, editar, desativar). Congregação com dados não pode ser apagada | MVP |
| RF-OR02 | Dois níveis apenas: sede → congregações | MVP |
| RF-OR03 | Responsável pela conta exibido somente leitura, com a orientação "para trocar, fale com o iEzer". Encarregado de LGPD editável pela igreja | MVP |
| RF-OR04 | Seletor do header lista só as organizações onde o usuário tem perfil; quem tem perfil na sede vê também "Todas as congregações". A escolha fica lembrada por usuário | MVP |
| RF-OR05 | Trocar de organização recarrega os dados daquela organização, sem misturar cache | MVP |

### Usuários (Configurações › Usuários)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-US01 | Lista com pessoa, e-mail, perfis por organização, status (convite pendente, ativo, desativado, suspenso), 2FA ligado e último acesso. Filtros por status, perfil e organização | MVP |
| RF-US02 | Editar perfis do usuário por organização, com o resumo em linguagem natural e as travas | MVP |
| RF-US03 | Desativar e reativar acesso. Desativar encerra as sessões e não altera a Pessoa | MVP |
| RF-US04 | Suspensão automática quando a situação da pessoa sai de Ativo, com aviso aos admins. Transferência interna não afeta o acesso. Reativar a pessoa não devolve o acesso sozinho: o admin reativa | MVP |
| RF-US05 | Encerrar as sessões de um usuário, sem desativá-lo | MVP |
| RF-US06 | Aba "Acesso" no perfil da pessoa (Pessoas): mostra se ela tem usuário, os perfis e o botão "Dar acesso" ou "Gerenciar acesso". Só aparece para quem tem a permissão | MVP |

### Perfis de acesso (Configurações › Perfis de acesso)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-PF01 | Lista de perfis com selo "de fábrica" e número de usuários em cada um | MVP |
| RF-PF02 | Criar, editar e duplicar perfil na tela de permissões definida no PRD de Pessoas: agrupada por módulo, switches, cadeado nas protegidas, dependências automáticas e resumo em linguagem natural | MVP |
| RF-PF03 | Restaurar padrão de um perfil de fábrica | MVP |
| RF-PF04 | Excluir perfil só sem usuários; com usuários, pede para onde movê-los | MVP |
| RF-PF05 | Prévia do perfil: lista dos menus, telas e abas que ele enxerga, no lugar de "ver como usuário X" | MVP |
| RF-PF06 | Relatório "quem pode o quê": matriz de usuários × permissões, exportável e registrada no log | F2 |

### Minha conta (menu do header)

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-MC01 | O header mostra o nome real ("Como prefere ser chamado") e o e-mail do usuário | MVP |
| RF-MC02 | Trocar senha (pede a atual) ou definir uma, para quem só usa Google | MVP |
| RF-MC03 | Ligar e desligar 2FA, escolher o método e gerar códigos de recuperação. Desligar fica bloqueado quando o 2FA é obrigatório | MVP |
| RF-MC04 | Sessões ativas (dispositivo, navegador, local aproximado, último uso), com encerrar uma ou todas | MVP |
| RF-MC05 | Meus acessos: perfis por organização e o resumo em linguagem natural | MVP |
| RF-MC06 | Trocar o e-mail de login exige confirmação no e-mail novo e avisa o antigo | MVP |

## Permissões

O Acesso declara seis permissões próprias e propõe o catálogo mínimo do Financeiro, sem o qual o tesoureiro não trabalha quando o login real entrar. O catálogo de Pessoas está no PRD de Pessoas.

### Catálogo do módulo Acesso e padrão de fábrica

| Nome na tela | Descrição exibida | Chave interna | Protegida | Pastor | Tesoureiro | Secretário |
| --- | --- | --- | --- | --- | --- | --- |
| Gerenciar perfis de acesso | Criar perfis e definir suas permissões | `acesso.perfis.gerenciar` | Sim | Sim | Não | Não |
| Gerenciar usuários | Dar acesso, mudar perfis de usuários e desativar acessos | `acesso.usuarios.gerenciar` | Sim | Sim | Não | Não |
| Ver usuários | Consultar quem tem acesso e com quais perfis | `acesso.usuarios.ver` | Não | Sim | Não | Não |
| Gerenciar organização | Editar dados da sede e criar ou desativar congregações | `organizacoes.gerenciar` | Não | Sim | Não | Não |
| Ver log de auditoria | Consultar e exportar o registro de quem fez o quê | `auditoria.ver` | Não | Sim | Não | Não |
| Autorizar acesso do suporte | Liberar a equipe do iEzer a ver os dados da igreja por um prazo | `acesso.suporte.autorizar` | Sim | Sim | Não | Não |

### Catálogo mínimo do Financeiro (proposta a validar)

| Nome na tela | Descrição exibida | Chave interna | Protegida | Pastor | Tesoureiro | Secretário |
| --- | --- | --- | --- | --- | --- | --- |
| Ver contas a pagar | Acessar a lista e o detalhe das contas a pagar | `financeiro.pagar.ver` | Não | Sim | Sim | Não |
| Lançar contas a pagar | Criar, editar e dar baixa em contas a pagar | `financeiro.pagar.editar` | Não | Sim | Sim | Não |
| Ver contas a receber | Acessar a lista e o detalhe das contas a receber | `financeiro.receber.ver` | Não | Sim | Sim | Não |
| Lançar contas a receber | Criar, editar e dar baixa em contas a receber | `financeiro.receber.editar` | Não | Sim | Sim | Não |
| Excluir lançamentos | Apagar contas a pagar ou a receber | `financeiro.excluir` | Não | Sim | Sim | Não |
| Editar cadastros financeiros | Centros de custo, bancos e contas, categorias e fornecedores | `financeiro.cadastros.editar` | Não | Sim | Sim | Não |

A permissão "Ver contribuições" de Pessoas (`pessoas.contribuicoes.ver`) continua sendo o único jeito de ver dízimos e ofertas por pessoa; "Ver contas a receber" mostra os lançamentos, e o nome da pessoa só aparece para quem também tem "Ver pessoas".

### Travas de segurança

- **Protegidas:** só quem já tem a permissão pode concedê-la a um perfil ou atribuir um perfil que a contenha. Toda concessão avisa por e-mail quem já a possui e entra no log.
- **Protegida exige 2FA:** quem passa a ter uma permissão protegida configura o 2FA no próximo login, também pelo Google.
- **Nunca ficar sem admin:** o sistema bloqueia remover "Gerenciar perfis de acesso" do último usuário ativo que a tem, e também desativá-lo. Se a suspensão automática atingir o último admin (ex.: falecimento), o acesso é suspenso e o responsável pela conta e o suporte do iEzer são avisados para a recuperação.
- **Ninguém altera o próprio acesso:** um usuário não muda os próprios perfis nem desativa a si mesmo. Evita autoconcessão.
- **Admin removido é avisado:** quem perde "Gerenciar perfis de acesso" recebe e-mail, e os demais admins também, como proteção contra tomada de conta.
- **Log de permissões:** toda mudança em perfil ou atribuição registra autor, alvo e o antes e depois.
- **Restaurar padrão:** perfis de fábrica podem ser editados e restaurados.
- **Vale na hora:** como o back confere a permissão em toda requisição, uma mudança vale a partir da próxima ação do usuário, sem novo login.

## Segurança e sessão

As regras seguem o NIST 800-63B-4 com um ajuste para voluntários (senha de 12 em vez de 15) e o 2FA concentrado em quem tem acesso amplo.

| Item | Regra | Fase |
| --- | --- | --- |
| Senha | Mínimo de 12 caracteres e aceita pelo menos 64. Sem exigência de maiúscula, número ou símbolo. Aceita espaço e acento. Recusa senhas vazadas, comuns, o e-mail e o nome da igreja, dizendo o motivo. Sem expiração; troca só com suspeita de comprometimento. Colar e gerenciador de senhas permitidos | MVP |
| 2FA, quem | Obrigatório para quem tem qualquer permissão protegida; opcional para os demais. Login pelo Google pede o 2FA do iEzer como o login por senha | MVP |
| 2FA, como | Código de 6 dígitos por e-mail (válido por 10 min) ou app autenticador (TOTP). Ao ativar, 10 códigos de recuperação de uso único | MVP |
| Sessão | Encerra após 7 dias sem uso. Sem nova pergunta de senha antes de ações críticas | MVP |
| Encerramento imediato | Desativar, suspender, trocar a senha, redefinir o 2FA ou trocar o e-mail derruba as sessões do usuário | MVP |
| Sair de todos | Em Minha conta, para o próprio usuário; em Usuários, para o admin | MVP |
| Tentativas | Após 5 erros seguidos, bloqueio temporário progressivo do login daquele e-mail, com aviso por e-mail. Limite também por IP em login, recuperação, convite e envio de código | MVP |
| Alertas por e-mail | Login em dispositivo novo, senha alterada, 2FA ligado, desligado ou redefinido, e-mail alterado, permissão protegida concedida, acesso do suporte autorizado | MVP |
| Termos | Termos de uso e termo de confidencialidade aceitos no primeiro acesso e quando a versão mudar | MVP |
| Passkeys | Login sem senha por chave de acesso do celular ou computador | F2 |

Trocar a senha na própria Minha conta pede a senha atual; isso não conflita com A4, que trata das ações administrativas.

## Acesso do suporte do iEzer

"Acesso do suporte" é a equipe do iEzer vendo os dados de uma igreja para resolver um problema que ela relatou. Como a igreja é a controladora e o iEzer o operador, isso só acontece com autorização da igreja, por prazo, e fica registrado.

Fluxo do acesso do suporte (diagrama no Doc, transcrito):

- Caminho normal: Pedido de acesso (motivo, prazo, escopo) → Admin autoriza? → sim: Acesso ativo (somente leitura, sem notas pastorais, tudo no log) → Encerrado (prazo vence ou admin revoga). Não: Recusado.
- Emergência (incidente, ordem judicial, igreja sem admin) → Dupla aprovação interna no iEzer → Acesso ativo, com aviso imediato ao responsável pela conta.

No caminho normal, nada é visto sem um admin autorizar; a emergência pula a autorização, mas exige dois aprovadores no iEzer e avisa a igreja na hora.

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-SP01 | Dois caminhos: o suporte pede pelo back-office (ligado a um chamado, com motivo, prazo e escopo) e o admin aprova em Configurações › Acesso do suporte; ou o admin autoriza por conta própria ao abrir o chamado | MVP |
| RF-SP02 | Prazo padrão de 24h e máximo de 72h, contado a partir da aprovação da igreja; pedido sem resposta expira em 7 dias (B15 do PRD Back-office). Somente leitura por padrão; escrita exige marcar e justificar (ex.: corrigir uma importação) e passa antes pelo Administrador iEzer | MVP |
| RF-SP03 | Aprova quem tem "Autorizar acesso do suporte". Todos os admins recebem e-mail da autorização | MVP |
| RF-SP04 | Enquanto o acesso está ativo, uma faixa em Configurações mostra "Suporte iEzer com acesso até dd/mm, hh:mm" e o botão Revogar | MVP |
| RF-SP05 | Notas pastorais nunca: o endpoint recusa qualquer requisição do suporte, mesmo autorizada | MVP |
| RF-SP06 | Cada atendente usa conta nominal, com 2FA obrigatório. Não existe login compartilhado do suporte | MVP |
| RF-SP07 | Tudo vai para o log com o nome do atendente: cada tela e registro aberto e cada alteração. A Auditoria tem o filtro "Suporte iEzer" | MVP |
| RF-SP08 | O acesso expira sozinho no prazo; revogar encerra na hora | MVP |
| RF-SP09 | Emergência (incidente, ordem judicial, igreja sem admin): dupla aprovação interna registrada com motivo, prazo máximo de 24h e aviso imediato ao responsável pela conta e aos admins | MVP |
| RF-SP10 | Recuperação de admin: pedido do responsável pela conta, verificação de identidade (documento e contato cadastrado; ata quando o próprio responsável muda), nomeação registrada no log e aviso a todos os admins atuais | MVP |
| RF-SP11 | Atendimento que não precisa ver dados (dúvida de uso, cobrança) não abre acesso | MVP |
| RF-SP12 | Sem personificação ("ver como usuário X"); para entender um problema de permissão, o suporte usa a prévia do perfil | MVP |

## Privacidade, LGPD e auditoria

A igreja é a controladora dos dados e o iEzer é o operador, que trata os dados conforme as instruções dela (LGPD, art. 39); o Acesso dá à igreja as ferramentas para provar quem viu e quem mudou o quê.

Três normas pesam aqui. A base de uma igreja é inteira de dado sensível (LGPD, art. 5º, II). Pela [Resolução CD/ANPD 15/2024](https://smabr.com/regulamento-de-comunicacao-de-incidente-de-seguranca/), um incidente com dado sensível ou com dado de autenticação conta como risco relevante: a comunicação à ANPD tem prazo de 3 dias úteis, e o registro do incidente é guardado por pelo menos 5 anos. O Marco Civil (Lei 12.965/2014, art. 15) obriga o iEzer a guardar os registros de acesso à aplicação por 6 meses.

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-LP01 | Audit log com autor (usuário, ou atendente do suporte, ou sistema), organização, data e hora, IP e dispositivo para: login, logout e falhas; convites; mudanças de perfil, permissão e atribuição; criação, alteração, importação e exportação de dados; leitura de notas pastorais; impressões; todo acesso do suporte | MVP |
| RF-LP02 | Configurações › Auditoria: filtros por autor, pessoa afetada, módulo, ação, organização e período, mais o filtro "Suporte iEzer". Exportação registrada no próprio log | MVP |
| RF-LP03 | O log é somente inclusão: nem admin nem o próprio iEzer pela aplicação editam ou apagam registros | MVP |
| RF-LP04 | Consulta "quem acessou ou alterou os dados desta pessoa", a partir do perfil dela, para atender pedido de titular e investigar incidente | MVP |
| RF-LP05 | Minimização no log: guarda os campos alterados e os valores antes e depois, nunca o conteúdo de notas pastorais (só o fato da leitura ou edição) | MVP |
| RF-LP06 | Retenção: logs de login por 12 meses; audit log de alterações durante todo o contrato; no encerramento, devolução ou eliminação conforme o contrato. Prazos finais validados com o jurídico | MVP |
| RF-LP07 | Termo de confidencialidade aceito por todo usuário no primeiro acesso, com versão e data no log | MVP |
| RF-LP08 | Dados de autenticação protegidos: senha só como hash forte, segredo do app autenticador e códigos de recuperação cifrados, tokens de convite e de redefinição guardados como hash | MVP |
| RF-LP09 | Processo de incidente do iEzer: avisar a igreja pelo responsável pela conta e pelo encarregado de LGPD dela, com o que aconteceu, quais dados e quem foi afetado, a tempo de ela cumprir o prazo da ANPD; registro de incidentes guardado por 5 anos | MVP (processo) |
| RF-LP10 | A "Atividade recente" do Painel passa a ler o audit log, respeitando as permissões de quem vê | F2 |

O contrato com a igreja precisa trazer as cláusulas de operador (o que o iEzer faz com os dados, suboperadores como Supabase e Render, incidentes, devolução). Isso fica fora do produto, mas o produto precisa cumprir o que o contrato prometer.

## Requisitos técnicos

A autenticação usa o Better Auth (A22); o modelo de permissões, o escopo por organização, os convites e a auditoria são do iEzer.

### Back

| ID | Requisito |
| --- | --- |
| RT-AB01 | Better Auth só para autenticação, com adapter Prisma e handler em `/api/auth/*` no [Fastify](https://www.better-auth.com/docs/integrations/fastify). Usa: e-mail e senha (`minPasswordLength: 12`, `revokeSessionsOnPasswordReset: true`), Google, plugin [`twoFactor`](https://www.better-auth.com/docs/plugins/2fa) (TOTP, OTP por e-mail, códigos de recuperação), plugin [`haveIBeenPwned`](https://www.better-auth.com/docs/plugins/have-i-been-pwned) e [sessões](https://www.better-auth.com/docs/concepts/session-management) (`expiresIn` de 7 dias com `updateAge` de 1 dia, listar e revogar). Sem cookie cache de sessão, para a suspensão valer na hora. Não usa os plugins `organization` nem `admin`. Toda criação de usuário (senha ou Google) passa por um hook que exige convite válido para o e-mail. O 2FA obrigatório para quem tem protegida e o bloqueio por e-mail após 5 erros são regras do iEzer em hooks e middleware, porque o Better Auth não as aplica sozinho |
| RT-AB02 | Entidades: `Organization` (sede ou congregação, `parentId`), contatos da conta (responsável, encarregado de LGPD), `User` (`personId` único, e-mail único, status, último acesso, 2FA), `AccessProfile` (da igreja, `factoryKey` quando de fábrica), `AccessProfilePermission` (perfil × chave), `UserAssignment` (usuário × perfil × organização), `Invitation`, `Session`, `SupportGrant` e `AuditLog` |
| RT-AB03 | `organizationId` em todas as tabelas de negócio (Pessoas, Financeiro, cadastros). Toda consulta filtrada no servidor pelas organizações que o usuário alcança; atribuição na sede alcança as congregações dela |
| RT-AB04 | Checagem por rota (`requirePermission('pessoas.ver')`) contra a organização do recurso, nunca contra o que o front diz. `GET /me` devolve usuário, pessoa, organizações e permissões por organização |
| RT-AB05 | Catálogo em código, um arquivo por módulo; `GET /acesso/permissoes` devolve chave, nome, descrição, módulo, protegida e dependências |
| RT-AB06 | Seed dos perfis de fábrica por igreja e endpoint de restaurar padrão |
| RT-AB07 | Travas no servidor: último admin, protegidas, alteração do próprio acesso, 2FA obrigatório para quem tem protegida |
| RT-AB08 | Tokens de convite e de redefinição aleatórios (128 bits ou mais), guardados como hash, de uso único e com expiração (72h e 1h) |
| RT-AB09 | Limite de taxa por e-mail e por IP em login, recuperação, convite e envio de código |
| RT-AB10 | `AuditLog` gravado na mesma transação da alteração; o usuário de banco da aplicação não tem `UPDATE` nem `DELETE` nessa tabela. Campos: data, tipo de autor (usuário, suporte, sistema), autor, organização, módulo, ação, alvo, antes e depois, IP, dispositivo |
| RT-AB11 | `SupportGrant` conferido em toda requisição do suporte; o endpoint de notas pastorais recusa autor do tipo suporte |
| RT-AB12 | E-mails transacionais por um serviço de envio com SPF e DKIM no domínio do iEzer; remetente exibido "Nome da Igreja via iEzer" |
| RT-AB13 | Suspensão automática disparada pelos endpoints de ciclo de vida de Pessoas (inativar, desligar, falecimento, transferir para fora) na mesma transação |
| RT-AB14 | Back-office interno com autenticação própria da equipe iEzer, 2FA obrigatório e log no mesmo `AuditLog` |

### Front

| ID | Requisito |
| --- | --- |
| RT-AF01 | Rotas públicas `/login`, `/convite/:token` e `/redefinir-senha/:token`; todo o resto protegido. O flag de `localStorage` sai |
| RT-AF02 | `queryKeys.me` e `queryKeys.me.permissions`; `usePermission` e `<Can>` (RT-F06 de Pessoas) avaliados na organização ativa |
| RT-AF03 | Organização ativa no contexto e dentro de toda chave de query; trocar de organização não reaproveita cache de outra |
| RT-AF04 | 401 leva ao login e volta para a tela de origem; 403 mostra o nome amigável da permissão que falta |
| RT-AF05 | Header real: nome, e-mail, seletor de organização e menu Minha conta (sem os itens "Em breve") |
| RT-AF06 | Componentes novos: `PasswordInput` (mostrar e ocultar), `OtpInput` (6 dígitos, `autocomplete="one-time-code"`), tela de permissões com `Switch` por grupo. Todos passam pelo checklist da CLI (border sem cor, `bg-background`, `!classe`, `[--var]`, `duration-0`) |
| RT-AF07 | `autocomplete` correto nos campos (`username`, `current-password`, `new-password`) para gerenciadores de senha; campos com `text-base md:text-sm` contra o zoom do iOS |
| RT-AF08 | Telas de Usuários, Perfis e Auditoria seguem o padrão tabela → cards abaixo de `md` e skeleton espelhando o layout |

## Migração do estado atual

Todos os dados existentes vão para a sede da igreja piloto, e todo mundo passa a entrar por convite.

| Hoje | Vira |
| --- | --- |
| Login por flag no `localStorage` | Removido; ninguém entra sem conta real |
| `User` sem uso | Ligado a `Person` (`personId` único); nenhum registro a migrar |
| `Organization` sem uso | Sede da igreja piloto criada pelo back-office; congregações cadastradas no onboarding |
| Tabelas sem `organizationId` | Coluna obrigatória; dados existentes (pessoas, recebíveis, contas a pagar, cadastros) vão para a sede, com ação em lote em Pessoas para redistribuir |
| `AuditLog` sem autor | Ganha autor, tipo de autor, organização, alvo, antes e depois, IP e dispositivo; sem registros a migrar |
| Header "Administrador / admin@iezer.local" | Usuário logado e seletor real |
| Configurações › Acesso (Autenticação, Integração Email) | Configurações › Organização, Usuários, Perfis de acesso, Auditoria e Acesso do suporte. "Integração Email" sai do menu até a F2 |
| "Configurações: perfis, permissões e parâmetros" planejado | Ativo |
| Itens "Perfil", "Configurações" e "Plano" do menu da conta em "Em breve" | Perfil vira Minha conta; Plano continua "Em breve" até o autosserviço |

O primeiro admin da piloto é convidado pelo back-office com o perfil Pastor na sede.

## Recorte por fase

O MVP entrega tudo o que o MVP de Pessoas precisa para ir para produção; a F2 traz autosserviço e conveniências, e a F3 abre o acesso aos membros.

| Fase | Entrega |
| --- | --- |
| MVP | Login por e-mail e senha e por Google; 2FA por e-mail ou app; convite e primeiro acesso; recuperação de senha; sessão e alertas; onboarding pelo back-office; sede e congregações com seletor real; Usuários, Perfis de acesso, Auditoria e Acesso do suporte; Minha conta; catálogos de Acesso, Pessoas e Financeiro mínimo; travas; suspensão automática |
| F2 | Autosserviço com cobrança; login por código no WhatsApp; passkeys; domínio de e-mail próprio da igreja; relatório "quem pode o quê"; Atividade recente do Painel lida do audit log |
| F3 | Acesso da própria pessoa (app do membro, autocadastro, edição da própria ficha); mesma pessoa em duas igrejas-clientes; escopo por célula para líderes (com o PRD de Células) |

A fase de cada requisito está na coluna Fase das tabelas de requisitos funcionais.

## Dependências

O Acesso não depende de nenhum outro PRD para começar; Pessoas e Financeiro dependem dele, e o PRD de Organizações deixa de ser bloqueante porque o mínimo entrou aqui.

| PRD | Relação | O que o Acesso entrega ou precisa | Bloqueia o MVP do Acesso? |
| --- | --- | --- | --- |
| Pessoas | Depende do Acesso | Autenticação, `User` ligado a `Person`, catálogo, perfis por organização, travas, audit log com autor, `PersonPicker` no convite, aba Acesso no perfil, suspensão automática pelo ciclo de vida | Não; os dois entram juntos em produção |
| Organizações | Absorvido | Sede e congregações, `organizationId`, seletor real. Ficam para um PRD próprio, se necessário: parâmetros por congregação, relatórios consolidados | Não |
| Financeiro | Afetado | `organizationId` nas tabelas e o catálogo mínimo de permissões (a validar) | Não; entra junto |
| Painel | Afetado | Atividade recente lida do audit log | Não (F2) |
| Mensageria | Compartilha | Serviço de e-mail transacional; código por WhatsApp na F2 depende dela | Não |
| Células | Depende do Acesso | Atribuição com escopo de célula para líderes | Não |
| Kids | Depende do Acesso | Perfis de check-in, se o PRD de Kids pedir | Não |
| Back-office interno | Novo | Criar igreja, primeiro admin, pedidos de suporte, emergência e recuperação de admin | Sim, a versão mínima |

## Fora de escopo e validações

Fora de escopo deste PRD: acesso de membros pelo app, autocadastro, SSO corporativo (SAML), personificação de usuários, cobrança e planos, e parâmetros por congregação além dos dados cadastrais.

A validar com a igreja piloto e com o jurídico:

- Catálogo mínimo do Financeiro: o tesoureiro deve poder excluir lançamentos e editar cadastros financeiros?
- Nomes amigáveis das seis permissões do Acesso, testados com quem vai configurá-las.
- Código por e-mail como segunda etapa é aceito pelo pastor no dia a dia, ou ele prefere o app autenticador.
- Sessão de 7 dias sem uso no computador compartilhado da secretaria; avaliar um prazo máximo absoluto (ex.: 30 dias).
- Prazos do suporte: revistos pela B15 do PRD Back-office: 24h padrão e 72h no máximo, contados da aprovação da igreja; pedido sem resposta expira em 7 dias; 24h na emergência.
- Retenção dos logs (12 meses de login, contrato inteiro para alterações) com o jurídico ou o encarregado da igreja.
- Mesma pessoa servindo em duas igrejas-clientes: no MVP o e-mail de login é único no iEzer e o segundo convite é recusado. Confirmar que é raro.
- Documento aceito para trocar o responsável pela conta (ata, procuração, cartão CNPJ).

### Fontes

- [PRD — Pessoas: cadastro e gestão de pessoas](https://claude.ai/code/artifact/07546a99-1aac-4672-b841-7f75d810b7fe)
- [Planning Center: Permissions in People](https://help.planningcenter.com/en/permissions-in-people.html)
- [Planning Center: Permissions in account settings](https://help.planningcenter.com/en/permissions-in-account-settings.html)
- [Planning Center: exigir 2SV para org admins](https://www.planningcenter.com/changelog/global/new-require-two-step-verification-2sv-for-org-admins-and-billing-managers?ref=blog)
- [ChurchSuite: Improved user management](https://www.churchsuite.com/blog/2021-03-31-improved-user-management)
- [ChurchSuite: Multi-factor authentication](https://support.churchsuite.com/article/512-multi-factor-authentication)
- [Text In Church: Creating a plan for user access](https://academy.textinchurch.com/en/articles/11962461-creating-a-plan-for-user-access)
- [Text In Church: Can I turn off 2FA?](https://help.textinchurch.com/en/articles/9745273-can-i-turn-off-2fa-in-text-in-church)
- [ChurchSocial: 2FA para papéis com acesso ampliado](https://churchsocial.com/changelog/470)
- [ChurchApps: Roles & permissions](https://support.churchapps.org/docs/b1-admin/settings/roles-permissions)
- [NIST SP 800-63B-4 explicado (Sakimura)](https://www.sakimura.org/en/2025/10/7710/)
- [Resolução CD/ANPD 15/2024 (SMA)](https://smabr.com/regulamento-de-comunicacao-de-incidente-de-seguranca/)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Better Auth: Organization plugin](https://www.better-auth.com/docs/plugins/organization)

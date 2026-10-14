# Roteiro de homologação — MVP Acesso e Pessoas

Para fazer no navegador, no ambiente de homologação atual, só com dados fictícios.
Enquanto o Resend não tiver domínio, confira os e-mails (convite, código do 2FA, alertas, redefinição de senha) pelo log do back ou pelo "Copiar link".
Teste cada jornada no desktop e no celular. Anote o que falhar em "Achados", com a tela, o passo e o que aconteceu.

Prepare três janelas anônimas (ou navegadores diferentes) para alternar entre Pastor, Secretária e Tesoureiro.

## 1. Onboarding e primeiro acesso (Pastor)
- [ ] O convite do primeiro admin chega por e-mail, com o nome da igreja.
- [ ] O link abre a página do convite com quem convidou e o resumo do acesso.
- [ ] Senha curta, senha com o e-mail e senha vazada são recusadas com o motivo.
- [ ] Termos de uso e confidencialidade aparecem e precisam ser aceitos.
- [ ] A configuração do 2FA é exigida antes de entrar (perfil Pastor). Testar app autenticador e código por e-mail.
- [ ] O checklist de primeiro acesso aparece no Painel; o aviso de admin único aparece.
- [ ] Configurações › Organização: dados da sede e congregações corretos; responsável pela conta só leitura.

## 2. Montar a equipe (Pastor)
- [ ] Dar acesso à secretária a partir de uma Pessoa (PersonPicker) e também pelo cadastro rápido dentro do fluxo.
- [ ] O resumo em linguagem natural confere com o perfil escolhido.
- [ ] "Copiar link" funciona e o link enviado por WhatsApp abre no celular.
- [ ] Convidar um segundo admin; o aviso de admin único some.
- [ ] Criar um perfil novo duplicando o Secretário; dependências ligam sozinhas; o resumo muda.
- [ ] Prévia do perfil mostra só as telas certas.
- [ ] Tentar tirar "Gerenciar perfis" do último admin: bloqueado.
- [ ] Tentar alterar o próprio acesso: bloqueado.

## 3. Rotina da secretaria (Secretária)
- [ ] Login com e-mail e senha; login com Google (mesmo e-mail do convite).
- [ ] Pessoas: busca, atalhos de visão, filtros (Sheet no celular), ordenação e paginação.
- [ ] Cadastro rápido de visitante; aviso de duplicado por celular; CPF repetido bloqueia.
- [ ] Cadastro de criança exige responsável e consentimento.
- [ ] Perfil da pessoa: editar cada seção, CEP preenche o endereço, "aplicar a toda a família".
- [ ] Família: cadastrar filho a partir do responsável; trocar papel; remover.
- [ ] Ciclo de vida: promover visitante → novo convertido → membro (pede só o que falta); inativar; reativar; transferir para outra congregação.
- [ ] Registrar acompanhamento pelo perfil e pela listagem; aparece na linha do tempo e no card.
- [ ] Não vê aba Contribuições nem nada do Financeiro.
- [ ] Aba Histórico mostra as alterações com autor.

## 4. Importação (Secretária)
- [ ] Baixar o modelo; abrir no Excel (ou Numbers, exportando como .xlsx); dropdowns funcionam.
- [ ] Planilha de teste com erro de formato, duplicado e menor sem responsável: a prévia mostra cada caso.
- [ ] Pular e atualizar duplicados; confirmar com a declaração; baixar o relatório.

## 5. Financeiro (Tesoureiro)
- [ ] Vê Contas a Pagar e a Receber; lança uma receita escolhendo a pessoa pelo PersonPicker.
- [ ] Vê a aba Contribuições no perfil, mas não edita dados da pessoa nem cadastra pessoas.
- [ ] Não vê Configurações › Usuários, Perfis, Auditoria.

## 6. Segurança e Minha conta (todos)
- [ ] Minha conta: trocar senha, ver sessões, encerrar outra sessão, meus acessos, trocar e-mail (confirmação no e-mail novo, aviso no antigo).
- [ ] Alerta por e-mail de login em dispositivo novo.
- [ ] 6 senhas erradas seguidas bloqueiam o login e mandam aviso.
- [ ] "Esqueci minha senha" chega por e-mail, o link expira e encerra as outras sessões.
- [ ] Pastor desativa a secretária: ela cai na hora; reativar devolve o acesso.
- [ ] Registrar falecimento ou desligamento de uma pessoa com acesso: o acesso é suspenso na hora e os admins recebem e-mail.

## 7. Auditoria e suporte (Pastor)
- [ ] Configurações › Auditoria: filtros, detalhe e exportação; logins e falhas aparecem.
- [ ] Autorizar acesso do suporte por um prazo; a faixa aparece em Configurações; revogar encerra na hora.
- [ ] As leituras do atendente aparecem no filtro "Suporte iEzer".

## 8. Organização ativa (Pastor)
- [ ] Trocar de congregação no seletor muda os dados das telas.
- [ ] "Todas as congregações" mostra a visão consolidada e bloqueia criar registros.

## Achados

| # | Jornada / passo | O que aconteceu | Gravidade (bloqueia / incomoda / cosmético) |
| --- | --- | --- | --- |
|  |  |  |  |

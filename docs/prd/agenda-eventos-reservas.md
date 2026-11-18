# PRD - Agenda, eventos e reservas

## Objetivo

Disponibilizar uma agenda por organizacao para criar eventos, convidar ou convocar membros, delegar lideranca, montar escalas, registrar presenca e reservar espacos sem conflitos.

## Escopo do MVP

- Agenda em mes, semana e lista; lista como padrao no mobile.
- Eventos em rascunho, publicados, cancelados ou concluidos.
- Evento simples ou recorrente, com timezone IANA preservado na serie.
- Local interno com um ou mais espacos ou local externo com nome e endereco.
- Lideres delegados, convidados, convocados, respostas, escala e presenca.
- Reservas internas atomicas e sem sobreposicao, inclusive para rascunhos.
- Central de notificacoes no aplicativo, e-mail e lembretes por outbox transacional.
- Auditoria transacional e isolamento pela organizacao ativa.

## Regras principais

- Todos os usuarios da organizacao veem o resumo de eventos publicados. Detalhes sao restritos ao criador, lideres, convidados e convocados.
- Rascunhos podem ser excluidos. Eventos publicados nao podem ser apagados nem despublicados; devem ser cancelados.
- Lideres precisam ser membros ativos com usuario ativo. Podem administrar a execucao, mas nao publicar, cancelar serie, alterar recorrencia ou lideres.
- Participantes sao pessoas ativas com vinculo MEMBRO. Pessoas sem usuario podem participar e ter resposta registrada por gestor, com auditoria.
- Convidados respondem VOU, NAO_VOU ou TALVEZ. Convocados registram ciencia e VOU ou NAO_VOU; recusa exige justificativa.
- Respostas podem mudar ate o inicio da ocorrencia; depois, somente gestores.
- Aceitar escala define a resposta como VOU. Recusar escala nao altera a resposta do evento.
- Presenca e registrada depois do inicio como PRESENTE, AUSENTE ou JUSTIFICADO.
- Recorrencias suportam diaria, semanal, mensal e anual, com intervalo e termino por data, quantidade ou sem termino.
- A serie mantem doze meses de ocorrencias futuras materializadas. Ocorrencias invalidas de fim de mes ou 29 de fevereiro sao ignoradas.
- Edicoes recorrentes usam os escopos ESTA, ESTA_E_FUTURAS ou SERIE. Ocorrencias passadas nunca sao recalculadas.
- Alteracoes de data, horario ou local reiniciam respostas e aceites afetados; texto e cor preservam respostas.
- Reservas usam intervalos semiabertos e bloqueiam conflitos no PostgreSQL. Preparacao e limpeza ampliam o intervalo efetivo.
- Cancelamento libera a reserva sem apagar o historico.
- Falha de e-mail nao desfaz a operacao principal. Entregas usam idempotencia e novas tentativas.

## Permissoes

- `agenda.ver`
- `agenda.criar`
- `agenda.editar`
- `agenda.publicar`
- `agenda.cancelar`
- `agenda.convocar`
- `agenda.escala.gerenciar`
- `agenda.presenca.registrar`
- `agenda.espacos.gerenciar`
- `agenda.reservas.gerenciar`

O perfil Pastor recebe todas por padrao. Outros perfis sao configuraveis.

## Fora do MVP

WhatsApp, SMS, push, sincronizacao com calendarios externos, grupos permanentes, funcoes na escala, lista de espera, ingressos, equipamentos e participantes externos.

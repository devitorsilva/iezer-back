# Plano de implementacao - Agenda, eventos e reservas

## Arquitetura

O backend continua modular em Fastify, Zod, Prisma e PostgreSQL. A agenda usa serie recorrente como agregado principal e ocorrencias materializadas como unidade operacional. O frontend usa React Query e FullCalendar, preservando o design system existente.

## Etapas

1. **Fundacao e banco**
   - Adicionar `AGENDA`, timezone da organizacao, enums e modelos Prisma.
   - Criar migration versionada com indices e constraint de exclusao para reservas.
   - Adicionar catalogo de permissoes, perfil Pastor e rotulos de auditoria.
   - Instalar `rrule` e criar expansor de recorrencia com testes de borda.

2. **Espacos e reservas**
   - CRUD de espacos por organizacao.
   - Reservas avulsas e reservas de ocorrencias.
   - Operacao atomica para multiplos espacos e resposta de conflito consistente.

3. **Eventos e ocorrencias**
   - Criacao, leitura, edicao, publicacao, cancelamento e exclusao de rascunho.
   - Materializacao de doze meses e divisao de serie para ESTA_E_FUTURAS.
   - Controle de acesso global e delegado por evento.

4. **Participacao**
   - Lideres e participantes da serie.
   - Ciencia, respostas, escala e presenca por ocorrencia.
   - Privacidade e registro por representante com auditoria.

5. **Notificacoes**
   - Outbox transacional, idempotencia, tentativas e worker agendado.
   - Central `GET/PATCH /api/me/notificacoes` e e-mails sem rollback da mutacao.

6. **Frontend**
   - Navegacao Agenda, calendario mes/semana/lista e lista mobile.
   - Formulario em etapas, detalhe protegido, respostas, escala e presenca.
   - Paginas de espacos e reservas.
   - Central de notificacoes e contador de nao lidas.

7. **Verificacao**
   - Gerar Prisma Client e aplicar migration em ambiente de teste.
   - Executar testes de recorrencia e conflito, typecheck e builds.
   - Validar fluxos principais em desktop e mobile.

## Decisoes de implementacao

- Datas persistidas em UTC; `timezone` IANA fica imutavel na serie.
- Respostas iniciam em `PENDENTE`; convocacoes possuem ciencia separada.
- Filtros em lote sao expandidos e deduplicados em uma lista fixa de pessoas.
- Conflito durante expansao futura cria a ocorrencia sem reserva ativa e notifica gestores; nunca substitui uma reserva existente.
- O intervalo efetivo da reserva inclui preparacao e limpeza e permanece semiaberto.
- Somente criador ou usuario com permissao global publica, cancela serie, altera recorrencia ou lideres.
- Respostas notificam lideres apenas no aplicativo; publicacao, mudancas relevantes e lembretes podem enviar e-mail.

## Contratos HTTP

- `GET /api/agenda/eventos?from&to&view`: resumo permitido no intervalo.
- `POST /api/agenda/eventos`: cria serie e ocorrencias em rascunho.
- `GET /api/agenda/eventos/:id`: detalhe da serie, participantes e ocorrencias.
- `PATCH /api/agenda/eventos/:id`: altera dados da serie com escopo explicito quando recorrente.
- `DELETE /api/agenda/eventos/:id`: remove apenas rascunho nunca publicado.
- `POST /api/agenda/eventos/:id/publicar`: publica e enfileira notificacoes.
- `POST /api/agenda/eventos/:id/cancelar`: cancela com `scope` e motivo opcional.
- `PATCH /api/agenda/ocorrencias/:id`: altera ocorrencia ou divide a serie.
- `PATCH /api/agenda/ocorrencias/:id/resposta`: registra ciencia e resposta do proprio membro ou de terceiro autorizado.
- `PUT /api/agenda/ocorrencias/:id/escala`: substitui escala da ocorrencia ou registra aceite individual.
- `PUT /api/agenda/ocorrencias/:id/presencas`: salva presencas em lote depois do inicio.
- `GET|POST /api/agenda/espacos`, `GET|PATCH|DELETE /api/agenda/espacos/:id`: CRUD com exclusao convertida em inativacao quando houver historico.
- `GET|POST /api/agenda/reservas`, `GET|PATCH|DELETE /api/agenda/reservas/:id`: reservas avulsas; reserva de evento e gerida pela ocorrencia.
- `GET /api/me/notificacoes`: lista paginada e contagem de nao lidas.
- `PATCH /api/me/notificacoes/:id`: marca uma como lida.
- `PATCH /api/me/notificacoes`: marca todas como lidas.

Erros de dominio usam `AppError` com codigos estaveis, incluindo `AGENDA_EVENT_NOT_FOUND`, `AGENDA_SCOPE_REQUIRED`, `AGENDA_RESERVATION_CONFLICT`, `AGENDA_RESPONSE_CLOSED` e `AGENDA_PERMISSION_DENIED`.

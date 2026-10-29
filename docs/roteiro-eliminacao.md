# Roteiro de eliminação definitiva

Requisitos: `docs/prd/backoffice.md`, decisões B5 e B6 e requisitos RF-BO22 a RF-BO24, RF-BO58 e RF-BO60. Este roteiro é o processo manual do fim de contrato. O back-office não apaga dados: ele só gera a exportação e, no fim, registra a eliminação, que leva a igreja para **Encerrada**.

> **Antes da primeira igreja real**, o jurídico precisa validar os prazos de retenção, o que fica guardado e o texto do comprovante. Também é preciso conferir o prazo das cópias de segurança no plano do Supabase de produção (seção [Backups](#backups)).

## Quem participa

- **Executor:** um Administrador iEzer. Roda os passos e registra a eliminação no back-office.
- **Conferente:** outra pessoa da equipe. Confere o escopo antes do `COMMIT` e a contagem final. O nome dela vai no registro ("Conferido por"). Esta é a dupla checagem do RF-BO24.

## Antes de começar

1. **Contrato encerrado por escrito.** O pedido do responsável pela conta, a ata ou o distrato vira o documento anexado no registro (PDF, JPG ou PNG, até 10 MB).
2. **Igreja suspensa** no back-office (Situação › Suspender). Sem suspensão, ninguém pode exportar nem registrar.
3. **Exportação entregue.** No back-office, use Situação › Exportar dados. O responsável pela conta recebe o link por e-mail (uso único, 7 dias). Espere até a exportação aparecer como **Baixada** ou **Vencida**. Enquanto houver uma exportação em andamento ou à espera do download, o registro é recusado (`EXPORT_STILL_AVAILABLE`).
4. **Escopo conferido.** Copie o ID da sede da URL do back-office (`/igrejas/<id>`). Os dois conferem que nome e CNPJ batem com o contrato.

## O que é apagado e o que fica

| Conjunto | Destino |
| --- | --- |
| Pessoas, famílias e membros, parentesco, ciclo de vida, acompanhamentos, consentimentos | Apagados |
| Contas a pagar e a receber (contribuições) | Apagadas |
| Categorias, centros de custo, contas bancárias, fornecedores, listas da igreja | Apagados |
| Usuários da igreja (com sessões, senhas, 2FA, acessos e avisos vistos), convites, perfis de acesso | Apagados |
| Eventos de e-mail (webhook do Resend) e bloqueios de login dos usuários | Apagados |
| Auditoria: linhas com autor usuário da igreja | Apagadas |
| Auditoria: linhas da equipe (Suporte iEzer) e do sistema | Ficam, sem antes/depois e sem pessoas afetadas: só quem fez, o quê, quando e em qual tipo de registro (auditoria interna, B11) |
| Pedidos de acesso do suporte | Ficam, sem apontar para os usuários apagados |
| Sede e congregações (nome, CNPJ, situação) | Ficam: a igreja continua na lista, Encerrada (B5) |
| Responsável pela conta, encarregado de LGPD, histórico de responsáveis | Ficam como registro do contrato |
| Documentos da conta (Storage `<sede>/documentos/`) | Ficam até o descarte: data da eliminação + 5 anos (RF-BO58). O registro grava `discardAt`; apagar os vencidos é a rotina da F2 |
| Exportações (Storage `<sede>/exportacoes/`) | A rotina diária apaga o `.zip` 7 dias depois da geração; aqui só se confere |

## Passo 1: apagar no banco

Rode no **SQL Editor do Supabase de produção**, logado com o papel `postgres`, que é o dono das tabelas e pode desligar a trava. Pelo terminal, dá para usar `psql` com o `DIRECT_URL` (sem o parâmetro `?schema=`, que o `psql` não aceita) e `-v ON_ERROR_STOP=1`. Ensaiado na igreja fictícia Dezoito em 29/10/2026: primeiro com `ROLLBACK` no lugar do `COMMIT`, para ver as contagens, depois para valer. Troque `<SEDE_ID>` nas quatro ocorrências. A transação inteira é uma só: qualquer erro desfaz tudo.

O executor roda até o bloco de conferência, **sem o `COMMIT`**. O conferente lê o resultado. Só então roda `COMMIT`, ou `ROLLBACK` se algo não bateu.

```sql
BEGIN;

-- Escopo: sede e congregações; usuários da igreja (nunca contas da equipe).
CREATE TEMP TABLE elim_org ON COMMIT DROP AS
  SELECT "id" FROM "Organization" WHERE "id" = '<SEDE_ID>' OR "parentId" = '<SEDE_ID>';

CREATE TEMP TABLE elim_user ON COMMIT DROP AS
  SELECT u."id", u."email" FROM "User" u
  WHERE NOT EXISTS (SELECT 1 FROM "TeamMember" t WHERE t."userId" = u."id")
    AND (
      EXISTS (SELECT 1 FROM "UserAssignment" a WHERE a."userId" = u."id" AND a."organizationId" IN (SELECT "id" FROM elim_org))
      OR EXISTS (SELECT 1 FROM "Person" p WHERE p."id" = u."personId" AND p."organizationId" IN (SELECT "id" FROM elim_org))
    );

-- Conferência do escopo (o conferente lê antes de seguir).
SELECT o."name", o."type", o."cnpj", o."status" FROM "Organization" o WHERE o."id" IN (SELECT "id" FROM elim_org);
SELECT count(*) AS usuarios FROM elim_user;

-- Travas: igreja suspensa e nenhuma exportação à espera.
DO $$
BEGIN
  IF (SELECT "status" FROM "Organization" WHERE "id" = '<SEDE_ID>' AND "parentId" IS NULL) IS DISTINCT FROM 'SUSPENSA' THEN
    RAISE EXCEPTION 'A igreja precisa estar suspensa.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "ChurchExport"
    WHERE "organizationId" = '<SEDE_ID>'
      AND ("status" = 'PROCESSANDO' OR ("status" = 'PRONTA' AND "downloadedAt" IS NULL AND "deletedAt" IS NULL AND "expiresAt" > now()))
  ) THEN
    RAISE EXCEPTION 'Há exportação em andamento ou à espera do download.';
  END IF;
END $$;

-- Auditoria (RT-AB10): a trava de somente inclusão é desligada só dentro desta transação. O ALTER TABLE
-- segura o log de todo o sistema até o COMMIT, então não demore nesta etapa.
ALTER TABLE "AuditLog" DISABLE TRIGGER "audit_log_append_only_row";

DELETE FROM "AuditLog"
WHERE ("organizationId" IN (SELECT "id" FROM elim_org) AND "actorType" = 'USUARIO')
   OR "actorUserId" IN (SELECT "id" FROM elim_user);

UPDATE "AuditLog" SET "before" = NULL, "after" = NULL, "personIds" = '{}'
WHERE "organizationId" IN (SELECT "id" FROM elim_org);

ALTER TABLE "AuditLog" ENABLE TRIGGER "audit_log_append_only_row";

-- Pedidos do suporte ficam, sem os usuários da igreja.
UPDATE "SupportGrant" SET "requestedById" = NULL WHERE "requestedById" IN (SELECT "id" FROM elim_user);
UPDATE "SupportGrant" SET "approvedById" = NULL WHERE "approvedById" IN (SELECT "id" FROM elim_user);
UPDATE "SupportGrant" SET "closedById" = NULL WHERE "closedById" IN (SELECT "id" FROM elim_user);

-- Pessoas e o que depende delas (ordem das chaves estrangeiras).
DELETE FROM "PersonConsent"  WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "FollowUp"       WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "PersonEvent"    WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "PersonRelation" WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "Family"         WHERE "organizationId" IN (SELECT "id" FROM elim_org); -- FamilyMember em cascata
DELETE FROM "Receivable"     WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "Payable"        WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "Invite"         WHERE "churchId" = '<SEDE_ID>';                        -- InviteAssignment em cascata
DELETE FROM "LoginLock"      WHERE "email" IN (SELECT "email" FROM elim_user);
DELETE FROM "User"           WHERE "id" IN (SELECT "id" FROM elim_user);            -- Session, Account, TwoFactor, UserAssignment e AnnouncementView em cascata
DELETE FROM "Person"         WHERE "organizationId" IN (SELECT "id" FROM elim_org);

-- Cadastros e configurações da igreja.
DELETE FROM "AccessProfile"  WHERE "organizationId" IN (SELECT "id" FROM elim_org); -- permissões em cascata
DELETE FROM "ChurchListItem" WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "Category"       WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "CostCenter"     WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "BankAccount"    WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "Supplier"       WHERE "organizationId" IN (SELECT "id" FROM elim_org);
DELETE FROM "EmailEvent"     WHERE "organizationId" IN (SELECT "id" FROM elim_org);
UPDATE "Organization" SET "peopleSettings" = NULL WHERE "id" IN (SELECT "id" FROM elim_org);

-- Conferência final: tudo zero (é a mesma conta que o back-office faz antes de aceitar o registro).
SELECT
  (SELECT count(*) FROM "Person"        WHERE "organizationId" IN (SELECT "id" FROM elim_org)) AS pessoas,
  (SELECT count(*) FROM "Receivable"    WHERE "organizationId" IN (SELECT "id" FROM elim_org)) AS contas_receber,
  (SELECT count(*) FROM "Payable"       WHERE "organizationId" IN (SELECT "id" FROM elim_org)) AS contas_pagar,
  (SELECT count(*) FROM "AccessProfile" WHERE "organizationId" IN (SELECT "id" FROM elim_org)) AS perfis,
  (SELECT count(*) FROM "User" u WHERE u."id" IN (SELECT "id" FROM elim_user))                 AS usuarios,
  (SELECT count(*) FROM "AuditLog"
     WHERE "organizationId" IN (SELECT "id" FROM elim_org)
       AND ("actorType" = 'USUARIO' OR "before" IS NOT NULL OR "after" IS NOT NULL OR cardinality("personIds") > 0)) AS log_com_dados;

-- O conferente confere e só então:
-- COMMIT;   (ou ROLLBACK;)
```

Se o `COMMIT` não acontecer, por queda da conexão ou janela fechada, o Postgres desfaz a transação, e a trava do log volta ligada junto.

## Passo 2: conferir o Storage

No Supabase › Storage › bucket `iezer-documentos`, pasta `<SEDE_ID>/`:

- `exportacoes/`: deve estar vazia (a rotina apaga em 7 dias). Se sobrou algum `.zip` vencido, apague à mão.
- `documentos/`: **não apague.** São os documentos do contrato, guardados por mais 5 anos.

## Passo 3: registrar no back-office

Na página da igreja, use Situação › **Registrar eliminação**. Informe:

- a data da eliminação;
- quem conferiu;
- o documento (tipo, data, número da ata) com o anexo;
- observações, se houver.

O back-office confere de novo que não sobrou nada e recusa com `CHURCH_DATA_REMAINING` se a contagem não der zero. Depois, numa só transação, ele:

- grava o registro (`ChurchErasure`);
- passa a igreja para **Encerrada**;
- marca o descarte de todos os documentos da conta para daqui a 5 anos;
- grava `registrar_eliminacao` na Auditoria da igreja e na auditoria interna.

## Comprovante à igreja

No registro, o responsável pela conta recebe por e-mail o comprovante da eliminação (`churchErasureNotice`). O e-mail traz a data, o documento de referência, o que ficou guardado e o prazo das cópias de segurança. Se o e-mail não sair (ver o log do servidor), mande o mesmo texto à mão, a partir do registro na página da igreja.

## Backups

As cópias de segurança do Supabase não deixam apagar só uma igreja: os dados somem delas quando a cópia expira.

- **Plano gratuito (homologação de hoje):** não há cópias de segurança. A eliminação vale na hora.
- **Plano Pro:** cópias diárias guardadas por 7 dias. Com PITR, o prazo é o contratado (7, 14 ou 28 dias).
- O prazo citado no comprovante é `BACKUP_RETENTION_DAYS` em `src/modules/admin/igrejas/eliminacao.ts` (hoje, 7). Se o plano de produção guardar por mais tempo, ajuste a constante antes da primeira eliminação real.
- **Restauração de backup:** depois de restaurar uma cópia feita antes de uma eliminação, rode este roteiro de novo para cada igreja da tabela `ChurchErasure` com `erasedAt` posterior à data da cópia. O registro no back-office já existe e não precisa ser refeito.

## Depois

- A igreja Encerrada continua na lista do back-office, sem dados e sem acesso. O login, os convites e os pedidos de suporte já recusam igreja Encerrada (`CHURCH_SUSPENDED`).
- O descarte dos documentos com `discardAt` vencido é a rotina da F2 (PRD Back-office › Escopo).

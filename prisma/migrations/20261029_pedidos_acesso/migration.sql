-- Sprint 19: pedidos de acesso do suporte com os prazos da B15 (RT-BB11).

-- A aprovação interna vale para a escrita e para a emergência: renomeia sem recriar o tipo.
ALTER TYPE "SupportGrantStatus" RENAME VALUE 'AGUARDANDO_SEGUNDA_APROVACAO' TO 'AGUARDANDO_IEZER';

-- Quem aprovou dentro do iEzer (Administrador iEzer) e quando.
ALTER TABLE "SupportGrant" ADD COLUMN "internalApprovedById" TEXT,
ADD COLUMN "internalApprovedAt" TIMESTAMP(3);

ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_internalApprovedById_fkey" FOREIGN KEY ("internalApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Na emergência, o segundo atendente gravado em approvedBy passa a ser a aprovação interna.
UPDATE "SupportGrant"
SET "internalApprovedById" = "approvedById",
    "internalApprovedAt" = "approvedAt",
    "approvedById" = NULL,
    "approvedAt" = NULL
WHERE "origin" = 'EMERGENCIA' AND "approvedById" IS NOT NULL;

-- Pedidos abertos em homologação, com os prazos antigos, são encerrados.
UPDATE "SupportGrant"
SET "status" = 'ENCERRADO',
    "closedAt" = NOW(),
    "closeReason" = 'Encerrado na mudança dos prazos do suporte (Sprint 19).'
WHERE "status" = 'ATIVO' AND "expiresAt" > NOW();

UPDATE "SupportGrant"
SET "status" = 'CANCELADO',
    "closedAt" = NOW(),
    "closeReason" = 'Cancelado na mudança dos prazos do suporte (Sprint 19).'
WHERE "status" IN ('PENDENTE', 'AGUARDANDO_IEZER');

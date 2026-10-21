-- Situação da igreja (PRD Back-office, B5, RT-BB04).
CREATE TYPE "OrganizationStatus" AS ENUM ('IMPLANTACAO', 'ATIVA', 'SUSPENSA', 'ENCERRADA');

ALTER TABLE "Organization"
  ADD COLUMN "status" "OrganizationStatus" NOT NULL DEFAULT 'IMPLANTACAO',
  ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "statusReason" TEXT;

-- As igrejas que já existem estão em uso: viram Ativa.
UPDATE "Organization" SET "status" = 'ATIVA', "statusReason" = 'Igreja anterior ao back-office';

-- CNPJ único entre as sedes (RF-BO14); congregação pode repetir o da sede.
CREATE UNIQUE INDEX "Organization_sede_cnpj_key" ON "Organization"("cnpj") WHERE "parentId" IS NULL AND "cnpj" IS NOT NULL;

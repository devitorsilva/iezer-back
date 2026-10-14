-- CreateEnum
CREATE TYPE "PersonEventType" AS ENUM ('PROMOCAO', 'INATIVACAO', 'TRANSFERENCIA_INTERNA', 'TRANSFERENCIA', 'DESLIGAMENTO', 'FALECIMENTO', 'REATIVACAO');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "peopleSettings" JSONB;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "bondSince" DATE,
ADD COLUMN     "contactUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PersonEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "PersonEventType" NOT NULL,
    "date" DATE NOT NULL,
    "fromBond" "PersonBond",
    "toBond" "PersonBond",
    "fromStatus" "PersonStatus",
    "toStatus" "PersonStatus",
    "reasonId" TEXT,
    "note" TEXT,
    "details" JSONB,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonEvent_personId_date_idx" ON "PersonEvent"("personId", "date");

-- CreateIndex
CREATE INDEX "PersonEvent_organizationId_type_date_idx" ON "PersonEvent"("organizationId", "type", "date");

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "ChurchListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEvent" ADD CONSTRAINT "PersonEvent_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: contato "atualizado" na última edição conhecida; vínculo desde a data que o define
-- (admissão, conversão, primeira visita) ou o dia do cadastro no fuso da igreja.
UPDATE "Person" SET "contactUpdatedAt" = "updatedAt";

UPDATE "Person" SET "bondSince" = COALESCE(
  CASE "bond"
    WHEN 'MEMBRO' THEN "admissionDate"
    WHEN 'NOVO_CONVERTIDO' THEN "conversionDate"
    WHEN 'VISITANTE' THEN "firstVisitDate"
    ELSE NULL
  END,
  ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
);

-- Sprint 4: Pessoas — campos novos de Person, vínculo e situação, família, acompanhamento,
-- consentimento e listas da igreja (PRD Pessoas › Migração do modelo atual).
-- As listas de fábrica entram pelo script npm run pessoas:seed.

-- CreateEnum
CREATE TYPE "PersonBond" AS ENUM ('VISITANTE', 'NOVO_CONVERTIDO', 'CONGREGADO', 'MEMBRO', 'MEMBRO_EM_FORMACAO');
CREATE TYPE "PersonStatus" AS ENUM ('ATIVO', 'INATIVO', 'TRANSFERIDO', 'DESLIGADO', 'FALECIDO');
CREATE TYPE "Sex" AS ENUM ('MASCULINO', 'FEMININO');
CREATE TYPE "MaritalStatus" AS ENUM ('SOLTEIRO', 'CASADO', 'UNIAO_ESTAVEL', 'SEPARADO', 'DIVORCIADO', 'VIUVO');
CREATE TYPE "OtherDocumentType" AS ENUM ('RG', 'PASSAPORTE', 'CERTIDAO_NASCIMENTO', 'OUTRO');
CREATE TYPE "FamilyRole" AS ENUM ('RESPONSAVEL', 'CONJUGE', 'FILHO', 'OUTRO');
CREATE TYPE "FollowUpType" AS ENUM ('LIGACAO', 'VISITA', 'MENSAGEM', 'CONVERSA');
CREATE TYPE "ChurchListType" AS ENUM ('FORMA_ADMISSAO', 'MOTIVO_INATIVACAO', 'MOTIVO_DESLIGAMENTO', 'CARGO_ECLESIASTICO', 'COMO_CONHECEU');
CREATE TYPE "ConsentPurpose" AS ENUM ('CADASTRO', 'MENSAGERIA', 'IMAGEM');
CREATE TYPE "ConsentMethod" AS ENUM ('PAPEL', 'PLANILHA', 'DIGITAL');

-- Person: colunas novas (as antigas saem depois do backfill)
DROP INDEX "Person_name_idx";
DROP INDEX "Person_isActive_idx";
DROP INDEX "Person_organizationId_document_key";

ALTER TABLE "Person"
ADD COLUMN "preferredName" TEXT,
ADD COLUMN "searchName" TEXT,
ADD COLUMN "sex" "Sex",
ADD COLUMN "maritalStatus" "MaritalStatus",
ADD COLUMN "cpf" TEXT,
ADD COLUMN "otherDocumentType" "OtherDocumentType",
ADD COLUMN "otherDocumentNumber" TEXT,
ADD COLUMN "mobilePhone" TEXT,
ADD COLUMN "mobileIsWhatsapp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "secondaryPhone" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "street" TEXT,
ADD COLUMN "number" TEXT,
ADD COLUMN "complement" TEXT,
ADD COLUMN "district" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "bond" "PersonBond" NOT NULL DEFAULT 'VISITANTE',
ADD COLUMN "status" "PersonStatus" NOT NULL DEFAULT 'ATIVO',
ADD COLUMN "firstVisitDate" DATE,
ADD COLUMN "conversionDate" DATE,
ADD COLUMN "presentationDate" DATE,
ADD COLUMN "isBaptized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "baptismDate" DATE,
ADD COLUMN "baptismChurch" TEXT,
ADD COLUMN "infantBaptism" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "professionOfFaithDate" DATE,
ADD COLUMN "admissionMethodId" TEXT,
ADD COLUMN "admissionDate" DATE,
ADD COLUMN "originChurch" TEXT;

-- Dígito verificador do CPF (só para o backfill).
CREATE FUNCTION pg_temp.is_valid_cpf(digits TEXT) RETURNS BOOLEAN AS $$
DECLARE
  total INT;
  check1 INT;
  check2 INT;
BEGIN
  IF digits !~ '^\d{11}$' OR digits ~ '^(\d)\1{10}$' THEN
    RETURN FALSE;
  END IF;

  total := 0;
  FOR i IN 1..9 LOOP
    total := total + substr(digits, i, 1)::INT * (11 - i);
  END LOOP;
  check1 := (total * 10) % 11 % 10;

  total := 0;
  FOR i IN 1..10 LOOP
    total := total + substr(digits, i, 1)::INT * (12 - i);
  END LOOP;
  check2 := (total * 10) % 11 % 10;

  RETURN check1 = substr(digits, 10, 1)::INT AND check2 = substr(digits, 11, 1)::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Todo Member vira Membro; situação pelo isActive.
UPDATE "Person" SET
  "bond" = 'MEMBRO',
  "status" = CASE WHEN "isActive" THEN 'ATIVO'::"PersonStatus" ELSE 'INATIVO'::"PersonStatus" END,
  "searchName" = translate(
    lower("name"),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );

-- document → CPF (11 dígitos com DV válido) ou "outro documento".
UPDATE "Person" SET "cpf" = regexp_replace("document", '\D', '', 'g')
WHERE "document" IS NOT NULL AND pg_temp.is_valid_cpf(regexp_replace("document", '\D', '', 'g'));

UPDATE "Person" SET "otherDocumentType" = 'OUTRO', "otherDocumentNumber" = trim("document")
WHERE "document" IS NOT NULL AND trim("document") <> '' AND "cpf" IS NULL;

-- Telefone → dígitos com DDI 55 quando for número brasileiro sem DDI.
UPDATE "Person" SET "mobilePhone" = CASE
    WHEN length(regexp_replace("phone", '\D', '', 'g')) IN (10, 11) THEN '55' || regexp_replace("phone", '\D', '', 'g')
    ELSE regexp_replace("phone", '\D', '', 'g')
  END
WHERE "phone" IS NOT NULL AND regexp_replace("phone", '\D', '', 'g') <> '';

-- birthDate DateTime → DATE pelo dia mais próximo em UTC: cobre meia-noite UTC
-- e meia-noite de Brasília (03:00 UTC) sem deslocar um dia.
ALTER TABLE "Person" ALTER COLUMN "birthDate" SET DATA TYPE DATE
USING (("birthDate" AT TIME ZONE 'UTC') + INTERVAL '12 hours')::DATE;

ALTER TABLE "Person" ALTER COLUMN "searchName" SET NOT NULL;

ALTER TABLE "Person"
DROP COLUMN "document",
DROP COLUMN "isActive",
DROP COLUMN "phone";

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "FamilyRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "FollowUpType" NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "givenByPersonId" TEXT,
    "method" "ConsentMethod" NOT NULL,
    "textVersion" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChurchListItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ChurchListType" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_organizationId_cpf_key" ON "Person"("organizationId", "cpf");
CREATE INDEX "Person_organizationId_name_idx" ON "Person"("organizationId", "name");
CREATE INDEX "Person_organizationId_status_idx" ON "Person"("organizationId", "status");
CREATE INDEX "Person_birthDate_idx" ON "Person"("birthDate");
CREATE INDEX "Family_organizationId_idx" ON "Family"("organizationId");
CREATE UNIQUE INDEX "FamilyMember_personId_key" ON "FamilyMember"("personId");
CREATE INDEX "FamilyMember_familyId_idx" ON "FamilyMember"("familyId");
CREATE INDEX "FollowUp_personId_date_idx" ON "FollowUp"("personId", "date");
CREATE INDEX "FollowUp_organizationId_date_idx" ON "FollowUp"("organizationId", "date");
CREATE INDEX "PersonConsent_personId_purpose_idx" ON "PersonConsent"("personId", "purpose");
CREATE INDEX "PersonConsent_givenByPersonId_idx" ON "PersonConsent"("givenByPersonId");
CREATE UNIQUE INDEX "ChurchListItem_organizationId_type_name_key" ON "ChurchListItem"("organizationId", "type", "name");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_admissionMethodId_fkey" FOREIGN KEY ("admissionMethodId") REFERENCES "ChurchListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Family" ADD CONSTRAINT "Family_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonConsent" ADD CONSTRAINT "PersonConsent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonConsent" ADD CONSTRAINT "PersonConsent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonConsent" ADD CONSTRAINT "PersonConsent_givenByPersonId_fkey" FOREIGN KEY ("givenByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonConsent" ADD CONSTRAINT "PersonConsent_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChurchListItem" ADD CONSTRAINT "ChurchListItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recebível passa a impedir apagar a pessoa (antes: SetNull, que deixava o lançamento órfão).
ALTER TABLE "Receivable" DROP CONSTRAINT "Receivable_personId_fkey";
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

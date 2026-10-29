-- Parentesco entre pessoas (RF-F10, RF-F11), separado do domicílio. Aditiva.

-- CreateEnum
CREATE TYPE "PersonRelationType" AS ENUM ('PAI_MAE', 'CONJUGE');

-- CreateTable
CREATE TABLE "PersonRelation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "relativeId" TEXT NOT NULL,
    "type" "PersonRelationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonRelation_relativeId_idx" ON "PersonRelation"("relativeId");

-- CreateIndex
CREATE INDEX "PersonRelation_organizationId_idx" ON "PersonRelation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonRelation_personId_relativeId_key" ON "PersonRelation"("personId", "relativeId");

-- AddForeignKey
ALTER TABLE "PersonRelation" ADD CONSTRAINT "PersonRelation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRelation" ADD CONSTRAINT "PersonRelation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRelation" ADD CONSTRAINT "PersonRelation_relativeId_fkey" FOREIGN KEY ("relativeId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ninguém é parente de si; o par de cônjuges fica em ordem de id (comparação byte a byte, como no JS),
-- para haver um laço só por par.
ALTER TABLE "PersonRelation" ADD CONSTRAINT "PersonRelation_not_self" CHECK ("personId" <> "relativeId");
ALTER TABLE "PersonRelation" ADD CONSTRAINT "PersonRelation_spouse_order" CHECK ("type" <> 'CONJUGE' OR "personId" < "relativeId" COLLATE "C");

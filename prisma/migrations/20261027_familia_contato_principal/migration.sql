-- Contato principal do domicílio (RF-F08). O endereço do domicílio passa a ser o dele (RF-F03).
ALTER TABLE "Family" ADD COLUMN "primaryContactPersonId" TEXT;

ALTER TABLE "Family" ADD CONSTRAINT "Family_primaryContactPersonId_fkey" FOREIGN KEY ("primaryContactPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: o primeiro a entrar em cada família.
UPDATE "Family" f
SET "primaryContactPersonId" = first."personId"
FROM (
  SELECT DISTINCT ON ("familyId") "familyId", "personId"
  FROM "FamilyMember"
  ORDER BY "familyId", "createdAt", "id"
) first
WHERE first."familyId" = f."id";

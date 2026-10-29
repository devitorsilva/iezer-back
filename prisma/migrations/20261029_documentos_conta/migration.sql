-- Documentos da conta e histórico de responsáveis (B7, RF-BO25 a RF-BO28, RT-BB06). Aditiva.

-- CreateEnum
CREATE TYPE "AccountDocumentType" AS ENUM ('ATA', 'PROCURACAO', 'OUTRO');

-- CreateTable
CREATE TABLE "AccountDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "AccountDocumentType" NOT NULL,
    "documentDate" DATE NOT NULL,
    "minutesNumber" TEXT,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "discardAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountOwnerChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "previousName" TEXT NOT NULL,
    "previousJobTitle" TEXT,
    "previousEmail" TEXT NOT NULL,
    "previousPhone" TEXT,
    "newName" TEXT NOT NULL,
    "newJobTitle" TEXT,
    "newEmail" TEXT NOT NULL,
    "newPhone" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountOwnerChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountDocument_storagePath_key" ON "AccountDocument"("storagePath");

-- CreateIndex
CREATE INDEX "AccountDocument_organizationId_idx" ON "AccountDocument"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountOwnerChange_documentId_key" ON "AccountOwnerChange"("documentId");

-- CreateIndex
CREATE INDEX "AccountOwnerChange_organizationId_createdAt_idx" ON "AccountOwnerChange"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountDocument" ADD CONSTRAINT "AccountDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDocument" ADD CONSTRAINT "AccountDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOwnerChange" ADD CONSTRAINT "AccountOwnerChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOwnerChange" ADD CONSTRAINT "AccountOwnerChange_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountOwnerChange" ADD CONSTRAINT "AccountOwnerChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


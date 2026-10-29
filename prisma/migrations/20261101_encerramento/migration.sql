-- Fim de contrato (B6, B14, RT-BB07, RF-BO24). Aditiva.

-- CreateEnum
CREATE TYPE "ChurchExportStatus" AS ENUM ('PROCESSANDO', 'PRONTA', 'FALHOU', 'SUBSTITUIDA');

-- CreateTable
CREATE TABLE "ChurchExport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "ChurchExportStatus" NOT NULL DEFAULT 'PROCESSANDO',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "storagePath" TEXT,
    "sizeBytes" INTEGER,
    "datasets" JSONB,
    "tokenHash" TEXT,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "downloadIp" TEXT,
    "downloadUserAgent" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchErasure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "erasedAt" DATE NOT NULL,
    "checkedByName" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchErasure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChurchExport_storagePath_key" ON "ChurchExport"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchExport_tokenHash_key" ON "ChurchExport"("tokenHash");

-- CreateIndex
CREATE INDEX "ChurchExport_organizationId_requestedAt_idx" ON "ChurchExport"("organizationId", "requestedAt");

-- CreateIndex
CREATE INDEX "ChurchExport_status_expiresAt_idx" ON "ChurchExport"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchErasure_organizationId_key" ON "ChurchErasure"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchErasure_documentId_key" ON "ChurchErasure"("documentId");

-- AddForeignKey
ALTER TABLE "ChurchExport" ADD CONSTRAINT "ChurchExport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchExport" ADD CONSTRAINT "ChurchExport_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchErasure" ADD CONSTRAINT "ChurchErasure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchErasure" ADD CONSTRAINT "ChurchErasure_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchErasure" ADD CONSTRAINT "ChurchErasure_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


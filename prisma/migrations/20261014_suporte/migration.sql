-- CreateEnum
CREATE TYPE "SupportGrantOrigin" AS ENUM ('PEDIDO_SUPORTE', 'AUTORIZACAO_ADMIN', 'EMERGENCIA');

-- CreateEnum
CREATE TYPE "SupportGrantStatus" AS ENUM ('PENDENTE', 'AGUARDANDO_SEGUNDA_APROVACAO', 'ATIVO', 'RECUSADO', 'REVOGADO', 'ENCERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SupportEmergencyKind" AS ENUM ('INCIDENTE', 'ORDEM_JUDICIAL', 'IGREJA_SEM_ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSupportAgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupportGrant" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "origin" "SupportGrantOrigin" NOT NULL,
    "status" "SupportGrantStatus" NOT NULL,
    "emergencyKind" "SupportEmergencyKind",
    "ticket" TEXT,
    "reason" TEXT NOT NULL,
    "scope" TEXT[],
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "writeJustification" TEXT,
    "durationHours" INTEGER NOT NULL,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportGrant_churchId_status_idx" ON "SupportGrant"("churchId", "status");

-- CreateIndex
CREATE INDEX "SupportGrant_status_expiresAt_idx" ON "SupportGrant"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


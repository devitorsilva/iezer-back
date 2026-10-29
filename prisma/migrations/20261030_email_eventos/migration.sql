-- E-mails rejeitados vindos do webhook do Resend (RT-BB08), para o painel de saúde. Aditiva.

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('REJEITADO', 'RECLAMACAO');

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "type" "EmailEventType" NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT,
    "resendEmailId" TEXT,
    "webhookId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_webhookId_key" ON "EmailEvent"("webhookId");

-- CreateIndex
CREATE INDEX "EmailEvent_organizationId_occurredAt_idx" ON "EmailEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailEvent_email_occurredAt_idx" ON "EmailEvent"("email", "occurredAt");

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

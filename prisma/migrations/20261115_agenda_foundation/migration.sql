-- CreateEnum
CREATE TYPE "AgendaEventStatus" AS ENUM ('RASCUNHO', 'PUBLICADO', 'CANCELADO', 'CONCLUIDO');

-- Reservas concorrentes usam igualdade no espaco e sobreposicao no intervalo.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "AgendaOccurrenceStatus" AS ENUM ('AGENDADA', 'CANCELADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "AgendaLocationType" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "AgendaParticipantType" AS ENUM ('CONVIDADO', 'CONVOCADO');

-- CreateEnum
CREATE TYPE "AgendaParticipantVisibility" AS ENUM ('SOMENTE_LIDERES', 'NOMES', 'NOMES_E_RESPOSTAS');

-- CreateEnum
CREATE TYPE "AgendaResponseStatus" AS ENUM ('PENDENTE', 'VOU', 'NAO_VOU', 'TALVEZ');

-- CreateEnum
CREATE TYPE "AgendaScaleStatus" AS ENUM ('PENDENTE', 'ACEITO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "AgendaAttendanceStatus" AS ENUM ('PRESENTE', 'AUSENTE', 'JUSTIFICADO');

-- CreateEnum
CREATE TYPE "AgendaReservationKind" AS ENUM ('EVENTO', 'AVULSA');

-- CreateEnum
CREATE TYPE "AgendaReservationStatus" AS ENUM ('ATIVA', 'LIBERADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AgendaOutboxStatus" AS ENUM ('PENDENTE', 'PROCESSANDO', 'PROCESSADO', 'FALHOU');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'AGENDA';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- CreateTable
CREATE TABLE "AgendaEventSeries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL,
    "status" "AgendaEventStatus" NOT NULL DEFAULT 'RASCUNHO',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "locationType" "AgendaLocationType" NOT NULL,
    "externalLocationName" TEXT,
    "externalAddress" TEXT,
    "rrule" TEXT,
    "recurrenceUntil" TIMESTAMP(3),
    "occurrenceHorizonAt" TIMESTAMP(3),
    "participantVisibility" "AgendaParticipantVisibility" NOT NULL DEFAULT 'SOMENTE_LIDERES',
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaEventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaOccurrence" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "originalStartsAt" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AgendaOccurrenceStatus" NOT NULL DEFAULT 'AGENDADA',
    "titleOverride" TEXT,
    "descriptionOverride" TEXT,
    "colorOverride" TEXT,
    "locationTypeOverride" "AgendaLocationType",
    "externalLocationName" TEXT,
    "externalAddress" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaEventLeader" (
    "seriesId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaEventLeader_pkey" PRIMARY KEY ("seriesId","personId")
);

-- CreateTable
CREATE TABLE "AgendaSeriesParticipant" (
    "seriesId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "AgendaParticipantType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaSeriesParticipant_pkey" PRIMARY KEY ("seriesId","personId")
);

-- CreateTable
CREATE TABLE "AgendaOccurrenceResponse" (
    "occurrenceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "response" "AgendaResponseStatus" NOT NULL DEFAULT 'PENDENTE',
    "acknowledgedAt" TIMESTAMP(3),
    "justification" TEXT,
    "respondedAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaOccurrenceResponse_pkey" PRIMARY KEY ("occurrenceId","personId")
);

-- CreateTable
CREATE TABLE "AgendaOccurrenceScale" (
    "occurrenceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "AgendaScaleStatus" NOT NULL DEFAULT 'PENDENTE',
    "respondedAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaOccurrenceScale_pkey" PRIMARY KEY ("occurrenceId","personId")
);

-- CreateTable
CREATE TABLE "AgendaAttendance" (
    "occurrenceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "AgendaAttendanceStatus" NOT NULL,
    "justification" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaAttendance_pkey" PRIMARY KEY ("occurrenceId","personId")
);

-- CreateTable
CREATE TABLE "AgendaSpace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "preparationMinutes" INTEGER NOT NULL DEFAULT 0,
    "cleanupMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "kind" "AgendaReservationKind" NOT NULL,
    "title" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "effectiveStartsAt" TIMESTAMP(3) NOT NULL,
    "effectiveEndsAt" TIMESTAMP(3) NOT NULL,
    "status" "AgendaReservationStatus" NOT NULL DEFAULT 'ATIVA',
    "releasedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaReminder" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL DEFAULT 1440,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaOutbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "AgendaOutboxStatus" NOT NULL DEFAULT 'PENDENTE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgendaEventSeries_organizationId_status_idx" ON "AgendaEventSeries"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AgendaEventSeries_organizationId_startsAt_idx" ON "AgendaEventSeries"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "AgendaOccurrence_startsAt_status_idx" ON "AgendaOccurrence"("startsAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaOccurrence_seriesId_originalStartsAt_key" ON "AgendaOccurrence"("seriesId", "originalStartsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaOccurrence_seriesId_sequence_key" ON "AgendaOccurrence"("seriesId", "sequence");

-- CreateIndex
CREATE INDEX "AgendaEventLeader_personId_idx" ON "AgendaEventLeader"("personId");

-- CreateIndex
CREATE INDEX "AgendaSeriesParticipant_personId_idx" ON "AgendaSeriesParticipant"("personId");

-- CreateIndex
CREATE INDEX "AgendaOccurrenceResponse_personId_idx" ON "AgendaOccurrenceResponse"("personId");

-- CreateIndex
CREATE INDEX "AgendaOccurrenceScale_personId_idx" ON "AgendaOccurrenceScale"("personId");

-- CreateIndex
CREATE INDEX "AgendaAttendance_personId_idx" ON "AgendaAttendance"("personId");

-- CreateIndex
CREATE INDEX "AgendaSpace_organizationId_isActive_idx" ON "AgendaSpace"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaSpace_organizationId_name_key" ON "AgendaSpace"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AgendaReservation_organizationId_startsAt_idx" ON "AgendaReservation"("organizationId", "startsAt");

-- CreateIndex
CREATE INDEX "AgendaReservation_spaceId_effectiveStartsAt_effectiveEndsAt_idx" ON "AgendaReservation"("spaceId", "effectiveStartsAt", "effectiveEndsAt");

-- CreateIndex
CREATE INDEX "AgendaReservation_occurrenceId_idx" ON "AgendaReservation"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaReminder_seriesId_minutesBefore_key" ON "AgendaReminder"("seriesId", "minutesBefore");

-- CreateIndex
CREATE INDEX "AgendaNotification_userId_readAt_createdAt_idx" ON "AgendaNotification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AgendaNotification_organizationId_createdAt_idx" ON "AgendaNotification"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgendaOutbox_idempotencyKey_key" ON "AgendaOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgendaOutbox_status_availableAt_idx" ON "AgendaOutbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AgendaOutbox_organizationId_createdAt_idx" ON "AgendaOutbox"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgendaEventSeries" ADD CONSTRAINT "AgendaEventSeries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEventSeries" ADD CONSTRAINT "AgendaEventSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOccurrence" ADD CONSTRAINT "AgendaOccurrence_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AgendaEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEventLeader" ADD CONSTRAINT "AgendaEventLeader_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AgendaEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEventLeader" ADD CONSTRAINT "AgendaEventLeader_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaEventLeader" ADD CONSTRAINT "AgendaEventLeader_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaSeriesParticipant" ADD CONSTRAINT "AgendaSeriesParticipant_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AgendaEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaSeriesParticipant" ADD CONSTRAINT "AgendaSeriesParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOccurrenceResponse" ADD CONSTRAINT "AgendaOccurrenceResponse_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "AgendaOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOccurrenceResponse" ADD CONSTRAINT "AgendaOccurrenceResponse_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOccurrenceResponse" ADD CONSTRAINT "AgendaOccurrenceResponse_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOccurrenceScale" ADD CONSTRAINT "AgendaOccurrenceScale_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "AgendaOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOccurrenceScale" ADD CONSTRAINT "AgendaOccurrenceScale_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOccurrenceScale" ADD CONSTRAINT "AgendaOccurrenceScale_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaAttendance" ADD CONSTRAINT "AgendaAttendance_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "AgendaOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaAttendance" ADD CONSTRAINT "AgendaAttendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaAttendance" ADD CONSTRAINT "AgendaAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaSpace" ADD CONSTRAINT "AgendaSpace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaReservation" ADD CONSTRAINT "AgendaReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaReservation" ADD CONSTRAINT "AgendaReservation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "AgendaSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaReservation" ADD CONSTRAINT "AgendaReservation_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "AgendaOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaReservation" ADD CONSTRAINT "AgendaReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaReminder" ADD CONSTRAINT "AgendaReminder_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "AgendaEventSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaNotification" ADD CONSTRAINT "AgendaNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaNotification" ADD CONSTRAINT "AgendaNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaNotification" ADD CONSTRAINT "AgendaNotification_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "AgendaOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaOutbox" ADD CONSTRAINT "AgendaOutbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariantes que nao podem depender apenas da camada de aplicacao.
ALTER TABLE "AgendaEventSeries"
  ADD CONSTRAINT "AgendaEventSeries_valid_interval" CHECK ("endsAt" > "startsAt");

ALTER TABLE "AgendaOccurrence"
  ADD CONSTRAINT "AgendaOccurrence_valid_interval" CHECK ("endsAt" > "startsAt");

ALTER TABLE "AgendaSpace"
  ADD CONSTRAINT "AgendaSpace_non_negative_capacity" CHECK ("capacity" IS NULL OR "capacity" >= 0),
  ADD CONSTRAINT "AgendaSpace_non_negative_buffers" CHECK ("preparationMinutes" >= 0 AND "cleanupMinutes" >= 0);

ALTER TABLE "AgendaReservation"
  ADD CONSTRAINT "AgendaReservation_valid_interval" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "AgendaReservation_valid_effective_interval" CHECK ("effectiveEndsAt" > "effectiveStartsAt"),
  ADD CONSTRAINT "AgendaReservation_no_active_overlap"
    EXCLUDE USING gist (
      "spaceId" WITH =,
      tsrange("effectiveStartsAt", "effectiveEndsAt", '[)') WITH &&
    ) WHERE ("status" = 'ATIVA');

ALTER TABLE "AgendaReminder"
  ADD CONSTRAINT "AgendaReminder_non_negative_minutes" CHECK ("minutesBefore" >= 0);

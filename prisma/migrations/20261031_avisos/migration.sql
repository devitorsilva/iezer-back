-- Avisos em massa da equipe (B13, RT-BB10). Aditiva.

-- CreateEnum
CREATE TYPE "AnnouncementLevel" AS ENUM ('INFORMATIVO', 'MANUTENCAO', 'IMPORTANTE');

-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('TODAS', 'SITUACAO', 'ESCOLHIDAS');

-- CreateEnum
CREATE TYPE "AnnouncementRecipients" AS ENUM ('TODOS', 'ADMINS');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "level" "AnnouncementLevel" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "churchStatuses" "OrganizationStatus"[],
    "recipients" "AnnouncementRecipients" NOT NULL,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "emailRecipientCount" INTEGER,
    "createdById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementChurch" (
    "announcementId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "AnnouncementChurch_pkey" PRIMARY KEY ("announcementId","organizationId")
);

-- CreateTable
CREATE TABLE "AnnouncementView" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_publishedAt_startsAt_endsAt_idx" ON "Announcement"("publishedAt", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "AnnouncementChurch_organizationId_idx" ON "AnnouncementChurch"("organizationId");

-- CreateIndex
CREATE INDEX "AnnouncementView_userId_idx" ON "AnnouncementView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementView_announcementId_userId_key" ON "AnnouncementView"("announcementId", "userId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementChurch" ADD CONSTRAINT "AnnouncementChurch_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementChurch" ADD CONSTRAINT "AnnouncementChurch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementView" ADD CONSTRAINT "AnnouncementView_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementView" ADD CONSTRAINT "AnnouncementView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Fim depois do início (RF-BO44).
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_period_check" CHECK ("endsAt" > "startsAt");

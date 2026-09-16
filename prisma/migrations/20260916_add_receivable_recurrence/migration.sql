ALTER TABLE "Receivable"
ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurrenceFrequency" "RecurrenceFrequency",
ADD COLUMN "recurrenceCount" INTEGER,
ADD COLUMN "recurrenceGroupId" TEXT;

CREATE INDEX "Receivable_recurrenceGroupId_idx" ON "Receivable"("recurrenceGroupId");

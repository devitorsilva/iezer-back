ALTER TABLE "Payable"
ADD COLUMN "settledAmount" DECIMAL(14, 2),
ADD COLUMN "settledAt" TIMESTAMP(3),
ADD COLUMN "settlementMethod" TEXT;

ALTER TABLE "Receivable"
ADD COLUMN "settledAmount" DECIMAL(14, 2),
ADD COLUMN "settledAt" TIMESTAMP(3),
ADD COLUMN "settlementMethod" TEXT;

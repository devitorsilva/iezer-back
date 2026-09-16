ALTER TABLE "Payable" ADD COLUMN "settlementBankAccountId" TEXT;

ALTER TABLE "Receivable" ADD COLUMN "settlementBankAccountId" TEXT;

CREATE INDEX "Payable_settlementBankAccountId_idx" ON "Payable"("settlementBankAccountId");

CREATE INDEX "Receivable_settlementBankAccountId_idx" ON "Receivable"("settlementBankAccountId");

ALTER TABLE "Payable" ADD CONSTRAINT "Payable_settlementBankAccountId_fkey"
  FOREIGN KEY ("settlementBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_settlementBankAccountId_fkey"
  FOREIGN KEY ("settlementBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

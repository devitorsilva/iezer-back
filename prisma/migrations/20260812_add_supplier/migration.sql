CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "cnpj" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "pixKey" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_cnpj_key" ON "Supplier"("cnpj");

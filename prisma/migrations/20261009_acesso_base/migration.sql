-- Sprint 1 · Base de dados: organizações, Person, User (Better Auth) e AuditLog.
-- Escrita à mão a partir do `prisma migrate diff`: Member é renomeado (não recriado)
-- e os dados existentes vão para a sede antes do NOT NULL.

-- Enums
CREATE TYPE "OrganizationType" AS ENUM ('SEDE', 'CONGREGACAO');
CREATE TYPE "OrganizationContactRole" AS ENUM ('RESPONSAVEL_CONTA', 'ENCARREGADO_LGPD');
CREATE TYPE "UserStatus" AS ENUM ('ATIVO', 'DESATIVADO', 'SUSPENSO');
CREATE TYPE "AuditActorType" AS ENUM ('USUARIO', 'SUPORTE', 'SISTEMA');
ALTER TYPE "ModuleKey" ADD VALUE 'ACESSO';
ALTER TYPE "ModuleKey" ADD VALUE 'PESSOAS';

-- Organization: sede ou congregação (dois níveis)
ALTER TABLE "Organization"
ADD COLUMN "type" "OrganizationType" NOT NULL DEFAULT 'SEDE',
ADD COLUMN "parentId" TEXT,
ADD COLUMN "cnpj" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_type_parent_check"
  CHECK (("type" = 'SEDE' AND "parentId" IS NULL) OR ("type" = 'CONGREGACAO' AND "parentId" IS NOT NULL));

CREATE INDEX "Organization_parentId_idx" ON "Organization"("parentId");

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sede que recebe os dados existentes. Id fixo, igual a DEFAULT_ORGANIZATION_ID
-- (src/lib/organization.ts); nome provisório até o script de onboarding (Sprint 6).
INSERT INTO "Organization" ("id", "name", "slug", "type", "updatedAt")
VALUES ('csedepiloto00000000000000', 'Sede', 'sede', 'SEDE', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- OrganizationContact: responsável pela conta e encarregado de LGPD
CREATE TABLE "OrganizationContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "OrganizationContactRole" NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationContact_organizationId_role_key" ON "OrganizationContact"("organizationId", "role");

ALTER TABLE "OrganizationContact" ADD CONSTRAINT "OrganizationContact_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Member -> Person (só renomeia; campos novos na Sprint 4)
ALTER TABLE "Member" RENAME TO "Person";
ALTER TABLE "Person" RENAME CONSTRAINT "Member_pkey" TO "Person_pkey";
ALTER INDEX "Member_name_idx" RENAME TO "Person_name_idx";
ALTER INDEX "Member_isActive_idx" RENAME TO "Person_isActive_idx";
DROP INDEX "Member_document_key";

-- Receivable.memberId -> personId
ALTER TABLE "Receivable" RENAME COLUMN "memberId" TO "personId";
ALTER TABLE "Receivable" RENAME CONSTRAINT "Receivable_memberId_fkey" TO "Receivable_personId_fkey";
ALTER INDEX "Receivable_memberId_idx" RENAME TO "Receivable_personId_idx";

-- organizationId obrigatório nas tabelas de negócio: adiciona, preenche com a sede, trava
ALTER TABLE "Supplier" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Category" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "CostCenter" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Person" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Payable" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Receivable" ADD COLUMN "organizationId" TEXT;

UPDATE "Supplier" SET "organizationId" = 'csedepiloto00000000000000';
UPDATE "Category" SET "organizationId" = 'csedepiloto00000000000000';
UPDATE "BankAccount" SET "organizationId" = 'csedepiloto00000000000000';
UPDATE "CostCenter" SET "organizationId" = 'csedepiloto00000000000000';
UPDATE "Person" SET "organizationId" = 'csedepiloto00000000000000';
UPDATE "Payable" SET "organizationId" = 'csedepiloto00000000000000';
UPDATE "Receivable" SET "organizationId" = 'csedepiloto00000000000000';

ALTER TABLE "Supplier" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "BankAccount" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CostCenter" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Person" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Payable" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Receivable" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Person" ADD CONSTRAINT "Person_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unicidades passam a valer por organização
DROP INDEX "Supplier_cnpj_key";
DROP INDEX "Category_name_type_key";
DROP INDEX "BankAccount_bankName_accountName_key";
DROP INDEX "CostCenter_code_key";
DROP INDEX "CostCenter_name_key";

CREATE UNIQUE INDEX "Supplier_organizationId_cnpj_key" ON "Supplier"("organizationId", "cnpj");
CREATE UNIQUE INDEX "Category_organizationId_name_type_key" ON "Category"("organizationId", "name", "type");
CREATE UNIQUE INDEX "BankAccount_organizationId_bankName_accountName_key" ON "BankAccount"("organizationId", "bankName", "accountName");
CREATE UNIQUE INDEX "CostCenter_organizationId_name_key" ON "CostCenter"("organizationId", "name");
CREATE UNIQUE INDEX "CostCenter_organizationId_code_key" ON "CostCenter"("organizationId", "code");
CREATE UNIQUE INDEX "Person_organizationId_document_key" ON "Person"("organizationId", "document");
CREATE INDEX "Payable_organizationId_idx" ON "Payable"("organizationId");
CREATE INDEX "Receivable_organizationId_idx" ON "Receivable"("organizationId");

-- User no formato do Better Auth. passwordHash sai: a senha passa a ficar em
-- Account.password (providerId "credential"). A tabela não tem registros.
ALTER TABLE "User" DROP COLUMN "passwordHash",
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "image" TEXT,
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ATIVO',
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "personId" TEXT;

CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TwoFactor" ADD CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditLog: autor, tipo de autor, organização, alvo, antes/depois, IP e dispositivo.
-- Sem registros a migrar; o default só existe para o ADD COLUMN e é removido em seguida.
ALTER TABLE "AuditLog"
ADD COLUMN "actorType" "AuditActorType" NOT NULL DEFAULT 'SISTEMA',
ADD COLUMN "actorUserId" TEXT,
ADD COLUMN "organizationId" TEXT,
ADD COLUMN "targetType" TEXT,
ADD COLUMN "targetId" TEXT,
ADD COLUMN "before" JSONB,
ADD COLUMN "after" JSONB,
ADD COLUMN "ip" TEXT,
ADD COLUMN "userAgent" TEXT;

ALTER TABLE "AuditLog" ALTER COLUMN "actorType" DROP DEFAULT;

CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

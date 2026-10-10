-- Sprint 3: perfis de acesso, permissões por perfil e atribuições usuário × perfil × organização.
-- Só tabelas novas; os perfis de fábrica entram pelo script npm run acesso:seed (catálogo em código).

-- CreateEnum
CREATE TYPE "AccessProfileFactoryKey" AS ENUM ('PASTOR', 'TESOUREIRO', 'SECRETARIO');

-- CreateTable
CREATE TABLE "AccessProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "factoryKey" "AccessProfileFactoryKey",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessProfilePermission" (
    "profileId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "AccessProfilePermission_pkey" PRIMARY KEY ("profileId","permissionKey")
);

-- CreateTable
CREATE TABLE "UserAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessProfile_organizationId_name_key" ON "AccessProfile"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AccessProfile_organizationId_factoryKey_key" ON "AccessProfile"("organizationId", "factoryKey");

-- CreateIndex
CREATE INDEX "UserAssignment_organizationId_idx" ON "UserAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "UserAssignment_profileId_idx" ON "UserAssignment"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAssignment_userId_profileId_organizationId_key" ON "UserAssignment"("userId", "profileId", "organizationId");

-- AddForeignKey
ALTER TABLE "AccessProfile" ADD CONSTRAINT "AccessProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessProfilePermission" ADD CONSTRAINT "AccessProfilePermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AccessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAssignment" ADD CONSTRAINT "UserAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAssignment" ADD CONSTRAINT "UserAssignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AccessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAssignment" ADD CONSTRAINT "UserAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


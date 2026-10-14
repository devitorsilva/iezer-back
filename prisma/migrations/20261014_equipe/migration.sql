-- Sprint 15: equipe iEzer (PRD Back-office, B1 a B3, RT-BB02, RT-BB03).

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('ADMINISTRADOR', 'SUPORTE', 'IMPLANTACAO');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'BACKOFFICE';

-- AlterTable: último uso da sessão (regra das 12h ociosa da equipe).
ALTER TABLE "Session" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roles" "TeamRole"[],
    "invitedById" TEXT,
    "termsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TeamMember_roles_check" CHECK (cardinality("roles") > 0)
);

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "TeamRole"[],
    "tokenHash" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDENTE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,
    "acceptedUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TeamInvite_roles_check" CHECK (cardinality("roles") > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_key" ON "TeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_tokenHash_key" ON "TeamInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "TeamInvite_email_status_idx" ON "TeamInvite"("email", "status");

-- Um convite pendente por e-mail (como o Invite).
CREATE UNIQUE INDEX "TeamInvite_email_pending_key" ON "TeamInvite"("email") WHERE "status" = 'PENDENTE';

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: atendentes do suporte (Sprint 13) viram membros da equipe com o papel Suporte.
INSERT INTO "TeamMember" ("id", "userId", "roles", "updatedAt")
SELECT 'c' || substr(md5(random()::text || u."id"), 1, 24), u."id", ARRAY['SUPORTE']::"TeamRole"[], CURRENT_TIMESTAMP
FROM "User" u
WHERE u."isSupportAgent" = true;

-- Equipe só usa app autenticador (B2): quem tinha só o código por e-mail refaz a configuração
-- no próximo login. Sessões dos atendentes caem para valerem as regras novas.
UPDATE "User" u SET "twoFactorEnabled" = false
WHERE u."isSupportAgent" = true
  AND NOT EXISTS (SELECT 1 FROM "TwoFactor" t WHERE t."userId" = u."id" AND t."verified" = true);

DELETE FROM "TwoFactor" t
USING "User" u
WHERE t."userId" = u."id" AND u."isSupportAgent" = true AND t."verified" = false;

DELETE FROM "Session" s
USING "User" u
WHERE s."userId" = u."id" AND u."isSupportAgent" = true;

-- AlterTable: o papel passa para TeamMember.
ALTER TABLE "User" DROP COLUMN "isSupportAgent";

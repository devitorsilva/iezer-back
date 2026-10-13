-- Sprint 10: pessoas afetadas no AuditLog (RF-LP04, aba Histórico) e log somente inclusão (RF-LP03).

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "personIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "AuditLog_personIds_idx" ON "AuditLog" USING GIN ("personIds");

-- Backfill: alvo Person, `personId` no antes/depois, membros de família criada,
-- e a pessoa do usuário ou do convite.
UPDATE "AuditLog" AS a
SET "personIds" = ARRAY(
  SELECT DISTINCT id
  FROM (
    SELECT CASE WHEN a."targetType" = 'Person' THEN a."targetId" END AS id
    UNION ALL SELECT a."before" ->> 'personId'
    UNION ALL SELECT a."after" ->> 'personId'
    UNION ALL
    SELECT member ->> 'personId'
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(a."after" -> 'members') = 'array' THEN a."after" -> 'members' ELSE '[]'::jsonb END
    ) AS member
    UNION ALL SELECT u."personId" FROM "User" u WHERE a."targetType" = 'User' AND u."id" = a."targetId"
    UNION ALL SELECT i."personId" FROM "Invite" i WHERE a."targetType" = 'Invite' AND i."id" = a."targetId"
  ) AS ids
  WHERE id IS NOT NULL
);

-- Família renomeada: membros atuais.
UPDATE "AuditLog" AS a
SET "personIds" = ARRAY(SELECT fm."personId" FROM "FamilyMember" fm WHERE fm."familyId" = a."targetId")
WHERE a."targetType" = 'Family' AND a."action" = 'renomear';

-- Somente inclusão: ninguém altera ou apaga pela aplicação. A única exceção é o expurgo
-- dos logs de login com mais de 12 meses (RF-LP06).
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."module" = 'LOGIN' AND OLD."createdAt" < now() - interval '12 months' THEN
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION 'AuditLog é somente inclusão (RF-LP03)' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_append_only_row"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();

CREATE TRIGGER "audit_log_append_only_truncate"
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();

-- Papéis da API REST do Supabase (não usada pelo iEzer): nada além de leitura e inclusão.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM authenticated;
  END IF;
END;
$$;

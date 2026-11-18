-- Perfis Pastor existentes recebem as permissoes padrao do novo modulo.
INSERT INTO "AccessProfilePermission" ("profileId", "permissionKey")
SELECT profile.id, permission.key
FROM "AccessProfile" profile
CROSS JOIN (VALUES
  ('agenda.ver'),
  ('agenda.criar'),
  ('agenda.editar'),
  ('agenda.publicar'),
  ('agenda.cancelar'),
  ('agenda.convocar'),
  ('agenda.escala.gerenciar'),
  ('agenda.presenca.registrar'),
  ('agenda.espacos.gerenciar'),
  ('agenda.reservas.gerenciar')
) AS permission(key)
WHERE profile."factoryKey" = 'PASTOR'
ON CONFLICT ("profileId", "permissionKey") DO NOTHING;

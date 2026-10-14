import type { Prisma } from "@prisma/client";
import type { AccessibleOrganization } from "../../lib/access.js";
import { adminRemovedNotice, protectedGrantedNotice } from "../../lib/emails.js";
import { runAudited, type AuditActor, type AuditWriter } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { trySendMail, type MailMessage } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import { PROTECTED_PERMISSION_KEYS } from "../../lib/two-factor.js";
import { getPermission, isPermissionKey, type PermissionKey } from "./permissoes/catalog/index.js";

// Travas de segurança do Acesso (PRD Acesso › Travas de segurança, RT-AB07), usadas por
// perfis, usuários e convites.

type Db = Prisma.TransactionClient;

export const ADMIN_PERMISSION: PermissionKey = "acesso.perfis.gerenciar";

const PROTECTED_KEYS = PROTECTED_PERMISSION_KEYS;

export interface AssignmentData {
  organizationId: string;
  profileId: string;
}

// Perfis e organizações da igreja; quem concede ou retira precisa gerenciar usuários ali e já
// ter as permissões protegidas do perfil. organizations null: sistema (script), sem travas de autor.
export async function assertCanChangeAssignments(
  db: Db,
  churchId: string,
  organizations: AccessibleOrganization[] | null,
  assignments: AssignmentData[],
  mode: "conceder" | "retirar" = "conceder",
) {
  if (assignments.length === 0) return;

  const profileIds = [...new Set(assignments.map((item) => item.profileId))];
  const organizationIds = [...new Set(assignments.map((item) => item.organizationId))];

  const profiles = await db.accessProfile.findMany({
    where: { id: { in: profileIds }, organizationId: churchId },
    select: { id: true, permissions: { select: { permissionKey: true } } },
  });
  if (profiles.length !== profileIds.length) {
    throw new AppError(400, "INVALID_PROFILE", "Perfil de acesso não encontrado nesta igreja.");
  }

  const found = await db.organization.findMany({
    where: { id: { in: organizationIds }, isActive: true, OR: [{ id: churchId }, { parentId: churchId }] },
    select: { id: true, name: true },
  });
  if (found.length !== organizationIds.length) {
    throw new AppError(400, "INVALID_ORGANIZATION", "Organização não encontrada ou desativada.");
  }

  if (!organizations) return;

  const profileKeys = new Map(profiles.map((profile) => [profile.id, profile.permissions.map((p) => p.permissionKey)]));

  for (const { organizationId, profileId } of assignments) {
    const reach = organizations.find((org) => org.id === organizationId);
    const organizationName = found.find((org) => org.id === organizationId)!.name;

    if (!reach?.permissions.has("acesso.usuarios.gerenciar")) {
      throw new AppError(403, "PERMISSION_DENIED", `Você não pode gerenciar acessos em ${organizationName}.`);
    }

    const missing = profileKeys
      .get(profileId)!
      .filter(isPermissionKey)
      .find((key) => getPermission(key).protected && !reach.permissions.has(key));

    if (missing) {
      const verb = mode === "conceder" ? "concedê-la" : "retirá-la";
      throw new AppError(
        403,
        "PROTECTED_PERMISSION",
        `Só quem já tem a permissão "${getPermission(missing).name}" pode ${verb}.`,
      );
    }
  }
}

// Protegidas que entram ou saem de um perfil: quem altera precisa tê-las.
export function assertCanChangeKeys(
  keys: Iterable<string>,
  actorPermissions: ReadonlySet<PermissionKey>,
  mode: "conceder" | "retirar" = "conceder",
) {
  for (const key of keys) {
    if (isPermissionKey(key) && getPermission(key).protected && !actorPermissions.has(key)) {
      const verb = mode === "conceder" ? "concedê-la" : "retirá-la";
      throw new AppError(403, "PROTECTED_PERMISSION", `Só quem já tem a permissão "${getPermission(key).name}" pode ${verb}.`);
    }
  }
}

interface ProtectedHolder {
  id: string;
  name: string;
  email: string;
  keys: Set<PermissionKey>;
}

// Usuários ativos da igreja com alguma protegida, e quais. Tirado antes e depois de uma mudança,
// dá o último admin, as concessões e os admins removidos.
export type ProtectedSnapshot = Map<string, ProtectedHolder>;

export async function snapshotProtected(db: Db, churchId: string): Promise<ProtectedSnapshot> {
  const profile = { organizationId: churchId };
  const users = await db.user.findMany({
    where: {
      status: "ATIVO",
      assignments: {
        some: {
          organization: { isActive: true },
          profile: { ...profile, permissions: { some: { permissionKey: { in: PROTECTED_KEYS } } } },
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      assignments: {
        where: { organization: { isActive: true }, profile },
        select: {
          profile: {
            select: { permissions: { where: { permissionKey: { in: PROTECTED_KEYS } }, select: { permissionKey: true } } },
          },
        },
      },
    },
  });

  return new Map(
    users.map((user) => [
      user.id,
      {
        id: user.id,
        name: user.name,
        email: user.email,
        keys: new Set(
          user.assignments.flatMap(({ profile }) => profile.permissions.map((p) => p.permissionKey).filter(isPermissionKey)),
        ),
      },
    ]),
  );
}

const admins = (snapshot: ProtectedSnapshot) => [...snapshot.values()].filter((user) => user.keys.has(ADMIN_PERMISSION));

// Nunca ficar sem admin: só bloqueia quando havia admin ativo antes da mudança.
export function assertNotLastAdmin(before: ProtectedSnapshot, after: ProtectedSnapshot) {
  if (admins(before).length > 0 && admins(after).length === 0) {
    throw new AppError(
      409,
      "LAST_ADMIN",
      "A igreja ficaria sem ninguém com \"Gerenciar perfis de acesso\". Dê essa permissão a outra pessoa antes.",
    );
  }
}

// Depois da transação: avisa quem já tinha cada protegida concedida e, quando alguém perde
// "Gerenciar perfis de acesso", essa pessoa e os demais admins.
export async function notifyProtectedChanges(churchId: string, before: ProtectedSnapshot, after: ProtectedSnapshot) {
  const messages: Omit<MailMessage, "churchName">[] = [];

  const granted = [...after.values()]
    .map((user) => ({ user, keys: [...user.keys].filter((key) => !before.get(user.id)?.keys.has(key)) }))
    .filter(({ keys }) => keys.length > 0);

  for (const holder of before.values()) {
    const grants = granted
      .filter(({ user }) => user.id !== holder.id)
      .map(({ user, keys }) => ({
        userName: user.name,
        // Chaves do mesmo grupo têm o mesmo nome (ex.: notas pastorais ver/editar).
        permissions: [...new Set(keys.filter((key) => holder.keys.has(key)).map((key) => getPermission(key).name))],
      }))
      .filter(({ permissions }) => permissions.length > 0);

    if (grants.length) messages.push(protectedGrantedNotice({ to: holder.email, name: holder.name, churchName: null, grants }));
  }

  const afterAdminIds = new Set(admins(after).map((user) => user.id));
  const removed = admins(before).filter((user) => !afterAdminIds.has(user.id));

  if (removed.length) {
    const removedNames = removed.map((user) => user.name);
    for (const user of removed) {
      messages.push(adminRemovedNotice({ to: user.email, name: user.name, churchName: null, removedNames, self: true }));
    }
    for (const user of admins(after)) {
      messages.push(adminRemovedNotice({ to: user.email, name: user.name, churchName: null, removedNames, self: false }));
    }
  }

  if (messages.length === 0) return;

  const church = await prisma.organization.findUnique({ where: { id: churchId }, select: { name: true } });
  await Promise.all(messages.map((message) => trySendMail({ ...message, churchName: church?.name ?? null })));
}

// Escrita de acesso com as travas: retrato das protegidas antes e depois na mesma transação
// (último admin) e avisos por e-mail depois do commit.
export async function runGuarded<T>(
  actor: AuditActor,
  churchId: string,
  fn: (tx: Db, audit: AuditWriter) => Promise<T>,
): Promise<T> {
  const { result, before, after } = await runAudited(actor, async (tx, audit) => {
    const before = await snapshotProtected(tx, churchId);
    const result = await fn(tx, audit);
    const after = await snapshotProtected(tx, churchId);
    assertNotLastAdmin(before, after);
    return { result, before, after };
  });

  await notifyProtectedChanges(churchId, before, after);
  return result;
}

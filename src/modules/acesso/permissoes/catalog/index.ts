import type { AccessProfileFactoryKey } from "@prisma/client";
import { acessoPermissions } from "./acesso.js";
import { financeiroPermissions } from "./financeiro.js";
import { pessoasPermissions } from "./pessoas.js";
import type { PermissionDefinition } from "./types.js";

import { PERMISSION_MODULE_NAMES } from "./types.js";

export { PERMISSION_MODULE_NAMES };
export type { PermissionDefinition, PermissionModule } from "./types.js";

// Catálogo fixo em código, um arquivo por módulo (RT-AB05).
export const permissionCatalog = [
  ...acessoPermissions,
  ...pessoasPermissions,
  ...financeiroPermissions,
] as const;

export type PermissionKey = (typeof permissionCatalog)[number]["key"];

const byKey = new Map<string, PermissionDefinition>(
  permissionCatalog.map((permission) => [permission.key, permission]),
);

// Falha cedo (no boot) se uma dependência apontar para chave inexistente.
for (const permission of byKey.values()) {
  for (const dependency of permission.dependsOn) {
    if (!byKey.has(dependency)) {
      throw new Error(`Permissão ${permission.key} depende de chave inexistente: ${dependency}`);
    }
  }
}

export function isPermissionKey(key: string): key is PermissionKey {
  return byKey.has(key);
}

export function getPermission(key: PermissionKey): PermissionDefinition {
  return byKey.get(key)!;
}

export function factoryPermissionKeys(factoryKey: AccessProfileFactoryKey): PermissionKey[] {
  return permissionCatalog
    .filter((permission) => (permission.factory as readonly AccessProfileFactoryKey[]).includes(factoryKey))
    .map((permission) => permission.key);
}

// Resumo das permissões somadas, por módulo e na ordem do catálogo (RF-CV02, RF-CV05).
export function summarizePermissions(keys: Iterable<string>) {
  const selected = new Set(keys);
  const modules = new Map<PermissionDefinition["module"], string[]>();

  for (const permission of permissionCatalog) {
    if (!selected.has(permission.key)) continue;
    const names = modules.get(permission.module) ?? [];
    names.push(permission.name);
    modules.set(permission.module, names);
  }

  return [...modules].map(([module, permissions]) => ({
    module,
    moduleName: PERMISSION_MODULE_NAMES[module],
    permissions,
  }));
}

// Permissões de um perfil como serão gravadas: chaves do catálogo, grupos inteiros e
// dependências incluídas (PRD Pessoas › Tela de perfis e permissões). Devolve as chaves
// desconhecidas à parte, para o service recusar.
export function normalizePermissions(keys: Iterable<string>) {
  const unknown: string[] = [];
  const selected = new Set<PermissionKey>();
  const pending: PermissionKey[] = [];

  for (const key of keys) {
    if (isPermissionKey(key)) pending.push(key);
    else unknown.push(key);
  }

  while (pending.length) {
    const key = pending.pop()!;
    if (selected.has(key)) continue;
    selected.add(key);

    const permission = getPermission(key);
    const siblings = permission.group
      ? permissionCatalog.filter((other) => "group" in other && other.group === permission.group).map((other) => other.key)
      : [];

    for (const next of [...permission.dependsOn, ...siblings]) {
      if (isPermissionKey(next) && !selected.has(next)) pending.push(next);
    }
  }

  const permissions = permissionCatalog.map((permission) => permission.key).filter((key) => selected.has(key));
  return { permissions, unknown };
}

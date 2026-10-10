import type { AccessProfileFactoryKey } from "@prisma/client";
import { acessoPermissions } from "./acesso.js";
import { financeiroPermissions } from "./financeiro.js";
import { pessoasPermissions } from "./pessoas.js";
import type { PermissionDefinition } from "./types.js";

export { PERMISSION_MODULE_NAMES } from "./types.js";
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

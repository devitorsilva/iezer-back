import type { AccessProfileFactoryKey } from "@prisma/client";

export type PermissionModule = "acesso" | "pessoas" | "financeiro" | "configuracoes";

export const PERMISSION_MODULE_NAMES: Record<PermissionModule, string> = {
  acesso: "Acesso",
  pessoas: "Pessoas",
  financeiro: "Financeiro",
  configuracoes: "Configurações",
};

// A chave nunca muda; nome e descrição podem ser ajustados (PRD Pessoas › Permissões).
export interface PermissionDefinition {
  key: string;
  name: string;
  description: string;
  module: PermissionModule;
  // Só quem já tem pode conceder; quem tem usa 2FA (Sprint 12).
  protected: boolean;
  // Ligar esta liga as dependências; desligar uma dependência desliga esta.
  dependsOn: readonly string[];
  // Chaves do mesmo grupo aparecem como um switch só na tela de perfis.
  group?: string;
  // Perfis de fábrica que já vêm com esta permissão.
  factory: readonly AccessProfileFactoryKey[];
}

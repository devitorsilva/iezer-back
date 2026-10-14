import type { PermissionDefinition } from "./types.js";

// PRD Acesso › Catálogo do módulo Acesso e padrão de fábrica.
export const acessoPermissions = [
  {
    key: "acesso.perfis.gerenciar",
    name: "Gerenciar perfis de acesso",
    description: "Criar perfis e definir suas permissões",
    module: "acesso",
    protected: true,
    dependsOn: [],
    factory: ["PASTOR"],
  },
  {
    key: "acesso.usuarios.gerenciar",
    name: "Gerenciar usuários",
    description: "Dar acesso, mudar perfis de usuários e desativar acessos",
    module: "acesso",
    protected: true,
    dependsOn: ["acesso.usuarios.ver"],
    factory: ["PASTOR"],
  },
  {
    key: "acesso.usuarios.ver",
    name: "Ver usuários",
    description: "Consultar quem tem acesso e com quais perfis",
    module: "acesso",
    protected: false,
    dependsOn: [],
    factory: ["PASTOR"],
  },
  {
    key: "organizacoes.gerenciar",
    name: "Gerenciar organização",
    description: "Editar dados da sede e criar ou desativar congregações",
    module: "acesso",
    protected: false,
    dependsOn: [],
    factory: ["PASTOR"],
  },
  {
    key: "auditoria.ver",
    name: "Ver log de auditoria",
    description: "Consultar e exportar o registro de quem fez o quê",
    module: "acesso",
    protected: false,
    dependsOn: [],
    factory: ["PASTOR"],
  },
  {
    key: "acesso.suporte.autorizar",
    name: "Autorizar acesso do suporte",
    description: "Liberar a equipe do iEzer a ver os dados da igreja por um prazo",
    module: "acesso",
    protected: true,
    dependsOn: [],
    factory: ["PASTOR"],
  },
] as const satisfies readonly PermissionDefinition[];

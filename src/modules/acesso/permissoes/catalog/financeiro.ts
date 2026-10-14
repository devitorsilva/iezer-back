import type { PermissionDefinition } from "./types.js";

// PRD Acesso › Catálogo mínimo do Financeiro (proposta a validar com a piloto).
export const financeiroPermissions = [
  {
    key: "financeiro.pagar.ver",
    name: "Ver contas a pagar",
    description: "Acessar a lista e o detalhe das contas a pagar",
    module: "financeiro",
    protected: false,
    dependsOn: [],
    factory: ["PASTOR", "TESOUREIRO"],
  },
  {
    key: "financeiro.pagar.editar",
    name: "Lançar contas a pagar",
    description: "Criar, editar e dar baixa em contas a pagar",
    module: "financeiro",
    protected: false,
    dependsOn: ["financeiro.pagar.ver"],
    factory: ["PASTOR", "TESOUREIRO"],
  },
  {
    key: "financeiro.receber.ver",
    name: "Ver contas a receber",
    description: "Acessar a lista e o detalhe das contas a receber",
    module: "financeiro",
    protected: false,
    dependsOn: [],
    factory: ["PASTOR", "TESOUREIRO"],
  },
  {
    key: "financeiro.receber.editar",
    name: "Lançar contas a receber",
    description: "Criar, editar e dar baixa em contas a receber",
    module: "financeiro",
    protected: false,
    dependsOn: ["financeiro.receber.ver"],
    factory: ["PASTOR", "TESOUREIRO"],
  },
  {
    key: "financeiro.excluir",
    name: "Excluir lançamentos",
    description: "Apagar contas a pagar ou a receber",
    module: "financeiro",
    protected: false,
    dependsOn: [],
    factory: ["PASTOR", "TESOUREIRO"],
  },
  {
    key: "financeiro.cadastros.editar",
    name: "Editar cadastros financeiros",
    description: "Centros de custo, bancos e contas, categorias e fornecedores",
    module: "financeiro",
    protected: false,
    dependsOn: [],
    factory: ["PASTOR", "TESOUREIRO"],
  },
] as const satisfies readonly PermissionDefinition[];

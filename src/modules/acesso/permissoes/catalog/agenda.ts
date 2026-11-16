import type { PermissionDefinition } from "./types.js";

export const agendaPermissions = [
  { key: "agenda.ver", name: "Ver agenda", description: "Acessar eventos publicados e seus detalhes autorizados", module: "agenda", protected: false, dependsOn: [], factory: ["PASTOR"] },
  { key: "agenda.criar", name: "Criar eventos", description: "Criar eventos e recorrencias em rascunho", module: "agenda", protected: false, dependsOn: ["agenda.ver"], factory: ["PASTOR"] },
  { key: "agenda.editar", name: "Editar eventos", description: "Alterar eventos e ocorrencias autorizados", module: "agenda", protected: false, dependsOn: ["agenda.ver"], factory: ["PASTOR"] },
  { key: "agenda.publicar", name: "Publicar eventos", description: "Publicar eventos para a organizacao", module: "agenda", protected: false, dependsOn: ["agenda.editar"], factory: ["PASTOR"] },
  { key: "agenda.cancelar", name: "Cancelar eventos", description: "Cancelar ocorrencias ou series publicadas", module: "agenda", protected: false, dependsOn: ["agenda.editar"], factory: ["PASTOR"] },
  { key: "agenda.convocar", name: "Gerenciar participantes", description: "Convidar e convocar membros para eventos", module: "agenda", protected: false, dependsOn: ["agenda.editar"], factory: ["PASTOR"] },
  { key: "agenda.escala.gerenciar", name: "Gerenciar escala", description: "Montar e acompanhar a escala das ocorrencias", module: "agenda", protected: false, dependsOn: ["agenda.editar"], factory: ["PASTOR"] },
  { key: "agenda.presenca.registrar", name: "Registrar presenca", description: "Registrar presenca depois do inicio da ocorrencia", module: "agenda", protected: false, dependsOn: ["agenda.editar"], factory: ["PASTOR"] },
  { key: "agenda.espacos.gerenciar", name: "Gerenciar espacos", description: "Cadastrar e desativar espacos da organizacao", module: "agenda", protected: false, dependsOn: ["agenda.ver"], factory: ["PASTOR"] },
  { key: "agenda.reservas.gerenciar", name: "Gerenciar reservas", description: "Reservar espacos para eventos e usos avulsos", module: "agenda", protected: false, dependsOn: ["agenda.ver"], factory: ["PASTOR"] },
] as const satisfies readonly PermissionDefinition[];

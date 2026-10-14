import type { ModuleKey } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { getRequestContext } from "./access.js";
import { recordAudit } from "./audit.js";

const MODULE_BY_PREFIX: [string, ModuleKey][] = [
  ["/api/pessoas", "PESSOAS"],
  ["/api/financeiro", "FINANCEIRO"],
  ["/api/cadastro", "CADASTRO"],
  ["/api/relatorios", "RELATORIOS"],
  ["/api/acesso", "ACESSO"],
  ["/api/organizacao", "CONFIGURACOES"],
];

// Nome da tela de cada leitura, como aparece na Auditoria. Rota sem nome fica com o endereço.
const SCREEN_LABELS: Record<string, string> = {
  "/api/pessoas": "Lista de pessoas",
  "/api/pessoas/overview": "Visão geral de Pessoas",
  "/api/pessoas/duplicados": "Busca de duplicados",
  "/api/pessoas/indicadores": "Indicadores da jornada",
  "/api/pessoas/listas": "Listas da igreja",
  "/api/pessoas/importacao/modelo": "Planilha modelo de importação",
  "/api/pessoas/:id": "Perfil da pessoa",
  "/api/pessoas/:id/contribuicoes": "Contribuições da pessoa",
  "/api/pessoas/:id/acesso": "Acesso da pessoa",
  "/api/pessoas/:id/historico": "Histórico da pessoa",
  "/api/pessoas/:id/linha-do-tempo": "Linha do tempo da pessoa",
  "/api/financeiro/overview": "Visão geral do Financeiro",
  "/api/financeiro/contas-a-pagar": "Contas a pagar",
  "/api/financeiro/contas-a-receber": "Contas a receber",
  "/api/cadastro/overview": "Visão geral de Cadastro",
  "/api/cadastro/bancos-contas": "Bancos e contas",
  "/api/cadastro/bancos-contas/:id": "Conta bancária",
  "/api/cadastro/categorias": "Categorias",
  "/api/cadastro/categorias/:id": "Categoria",
  "/api/cadastro/centro-de-custo": "Centros de custo",
  "/api/cadastro/centro-de-custo/:id": "Centro de custo",
  "/api/cadastro/fornecedores": "Fornecedores",
  "/api/cadastro/fornecedores/:id": "Fornecedor",
  "/api/relatorios/overview": "Relatórios",
  "/api/organizacao": "Organização",
  "/api/acesso/usuarios": "Usuários",
  "/api/acesso/convites": "Convites",
  "/api/acesso/onboarding": "Checklist de primeiro acesso",
  "/api/acesso/perfis": "Perfis de acesso",
  "/api/acesso/auditoria": "Auditoria",
  "/api/acesso/auditoria/filtros": "Filtros da Auditoria",
  "/api/acesso/auditoria/exportar": "Exportação da Auditoria",
  "/api/acesso/suporte": "Acesso do suporte",
};

// Rotas com parâmetro conferidas depois das fixas (ex.: /pessoas/indicadores antes de /pessoas/:id).
const SCREEN_PATTERNS = Object.entries(SCREEN_LABELS)
  .filter(([route]) => route.includes(":"))
  .map(([route, label]) => ({ regex: new RegExp(`^${route.replace(/:[^/]+/g, "[^/]+")}$`), label }));

// Nome da tela a partir do endereço pedido. Serve também aos registros gravados antes dos nomes,
// que guardaram "GET /api/...".
export function screenLabel(description: string | null) {
  if (!description?.startsWith("GET ")) return description;

  const path = description.slice(4).split("?")[0]!.replace(/(.)\/$/, "$1");
  return SCREEN_LABELS[path] ?? SCREEN_PATTERNS.find(({ regex }) => regex.test(path))?.label ?? description;
}

// Toda tela e registro que o suporte abre vai para o log com o nome do atendente (RF-SP07);
// as escritas já saem pelo runAudited com o ator SUPORTE. Gravado antes da resposta: se o log
// falhar, o dado não sai. Leitura de uma pessoa entra também na aba Histórico dela.
export async function logSupportRead(request: FastifyRequest) {
  if (!request.access?.support || request.method !== "GET") return;

  const route = (request.routeOptions.url ?? request.url).replace(/(.)\/$/, "$1");
  const params = (request.params ?? {}) as Record<string, string | undefined>;
  const personId = route.startsWith("/api/pessoas/:id") ? params.id : undefined;

  await recordAudit(getRequestContext(request).actor, {
    organizationId: request.access.organizationId,
    module: MODULE_BY_PREFIX.find(([prefix]) => route.startsWith(prefix))?.[1] ?? "CONFIGURACOES",
    action: "suporte_ler",
    targetType: "Rota",
    targetId: params.id ?? null,
    description: SCREEN_LABELS[route] ?? `${request.method} ${request.url}`,
    // Busca e filtros contam o que foi procurado; sem eles, o nome da tela basta.
    after: { url: request.url.includes("?") ? request.url : undefined, grantId: request.access.support!.grantId },
    personIds: personId ? [personId] : [],
  });
}

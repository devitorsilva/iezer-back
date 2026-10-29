import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { rateLimitByIp } from "../../lib/rate-limit.js";
import { downloadChurchExport, peekChurchExport } from "../admin/igrejas/exportacao.js";

const tokenParamsSchema = z.object({ token: z.string().min(20, "Link inválido.").max(200, "Link inválido.") });

// Link da exportação de fim de contrato (RF-BO23), público como o convite, com limite por IP
// (RT-AB09). O token é o acesso: vai só no e-mail do responsável pela conta.
export const publicExportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:token", { preHandler: rateLimitByIp("exportacao-ver", 30, 60_000) }, async (request) => {
    const { token } = tokenParamsSchema.parse(request.params);
    return peekChurchExport(token);
  });

  app.post("/:token/baixar", { preHandler: rateLimitByIp("exportacao-baixar", 10, 15 * 60_000) }, async (request) => {
    const { token } = tokenParamsSchema.parse(request.params);
    return downloadChurchExport(token, { ip: request.ip ?? null, userAgent: request.headers["user-agent"] ?? null });
  });
};

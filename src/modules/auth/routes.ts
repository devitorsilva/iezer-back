import { FastifyPluginAsync } from "fastify";
import { auth } from "../../lib/auth.js";

// Repassa /api/auth/* para o Better Auth
// (https://www.better-auth.com/docs/integrations/fastify).
export const authRoutes: FastifyPluginAsync = async (app) => {
  // Corpo cru: o Better Auth faz o próprio parse, e POST sem corpo (sign-out)
  // não pode cair no erro de JSON vazio do Fastify.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  app.route({
    method: ["GET", "POST"],
    url: "/*",
    handler: async (request, reply) => {
      const url = new URL(request.url, `${request.protocol}://${request.host}`);
      const headers = new Headers();

      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined) {
          headers.append(key, Array.isArray(value) ? value.join(", ") : value);
        }
      }

      const body = typeof request.body === "string" && request.body.length > 0 ? request.body : undefined;
      const response = await auth.handler(
        new Request(url, { method: request.method, headers, body }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") {
          reply.header(key, value);
        }
      });

      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) {
        reply.header("set-cookie", cookies);
      }

      return reply.send(response.body ? await response.text() : null);
    },
  });
};

import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const normalizedValue = value.trim();

      if (
        normalizedValue === "" ||
        normalizedValue === '""' ||
        normalizedValue === "''"
      ) {
        return undefined;
      }
    }

    return value;
  },
  z.string().min(1).optional(),
);

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: optionalNonEmptyString,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString,
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(32),
  // URL pública da API vista pelo navegador. Em produção é o domínio do front,
  // que repassa /api/* para o Render (cookie de sessão fica first-party).
  BETTER_AUTH_URL: z.url().default("http://localhost:3333"),
});

export const env = envSchema.parse(process.env);

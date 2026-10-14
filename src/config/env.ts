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
  // Origem do app admin da equipe iEzer (RT-BB03, RT-BF01): CORS, trustedOrigins e links dos
  // e-mails da equipe. URL da Vercel até haver admin.<domínio>.
  ADMIN_WEB_ORIGIN: z.string().default("http://localhost:5174"),
  BETTER_AUTH_SECRET: z.string().min(32),
  // URL pública da API vista pelo navegador. Em produção é o domínio do front,
  // que repassa /api/* para o Render (cookie de sessão fica first-party).
  BETTER_AUTH_URL: z.url().default("http://localhost:3333"),
  // E-mail transacional (RT-AB12) pelo Resend. Sem chave, o e-mail vai para o log (dev).
  RESEND_API_KEY: optionalNonEmptyString,
  // Endereço do remetente; o nome exibido é "Nome da Igreja via iEzer".
  // onboarding@resend.dev só entrega para o e-mail da conta do Resend (sem domínio próprio).
  EMAIL_FROM: z.string().default("onboarding@resend.dev"),
  // Login com Google (RF-LG02). Sem as duas, o botão do Google responde que não está disponível.
  // Redirect autorizado no Google Cloud: BETTER_AUTH_URL + /api/auth/callback/google.
  GOOGLE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
});

export const env = envSchema.parse(process.env);

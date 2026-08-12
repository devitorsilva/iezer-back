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
});

export const env = envSchema.parse(process.env);

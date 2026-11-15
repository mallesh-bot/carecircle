import { z } from "zod";

/**
 * Typed, validated access to environment variables. Every variable is
 * optional so the app runs with zero configuration (embedded database,
 * in-app reminders, AI features switched off).
 */
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: optional,
  DATABASE_POSTGRES_URL: optional,
  POSTGRES_URL: optional,
  PGLITE_DIR: optional,
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: optional,
  GMAIL_USER: optional,
  GMAIL_APP_PASSWORD: optional,
  CRON_SECRET: optional,
  APP_URL: optional.pipe(z.url().optional()),
  VERCEL_PROJECT_PRODUCTION_URL: optional,
});

export type Env = z.infer<typeof envSchema>;

/** Reads and validates the environment on every call so tests can stub variables. */
export function env(): Env {
  return envSchema.parse(process.env);
}

export function databaseUrl(): string | undefined {
  const e = env();
  return e.DATABASE_URL ?? e.DATABASE_POSTGRES_URL ?? e.POSTGRES_URL;
}

export const isProduction = () => env().NODE_ENV === "production";

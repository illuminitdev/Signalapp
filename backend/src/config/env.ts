import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  // Pooled — app queries (Neon serverless / Fastify)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Direct — migrations, pg-boss durable jobs
  DATABASE_URL_UNPOOLED: z.string().optional().default(""),
  NEON_BRANCH: z.string().optional().default(""),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  EXA_API_KEY: z.string().optional().default(""),
  // Encrypts customer credentials stored in the database (each company's CRM connection).
  // Falls back to a key derived from AUTH_SECRET; set a dedicated one in production.
  SECRETS_ENCRYPTION_KEY: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = parsed.data;
  return cached;
}

/** Prefer direct URL for migrations / long-lived workers. */
export function getDirectDatabaseUrl(): string {
  const env = getEnv();
  return env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL;
}

export function isExaConfigured(): boolean {
  return Boolean(getEnv().EXA_API_KEY?.trim());
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

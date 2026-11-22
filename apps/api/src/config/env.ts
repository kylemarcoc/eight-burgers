import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  COOKIE_DOMAIN: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  SUPABASE_URL: z.url().default('http://127.0.0.1:54321'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
});

export type ApiConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appOrigin: string;
  cookieSecure: boolean;
  cookieDomain?: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
};

export function loadLocalEnvFiles(cwd = process.cwd()): void {
  const candidates = [
    resolve(cwd, '.env.local'),
    resolve(cwd, '.env'),
    resolve(cwd, 'apps/api/.env.local'),
    resolve(cwd, 'apps/api/.env'),
  ];
  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        process.loadEnvFile(filePath);
      } catch {
        // Ignore unreadable local env files and fall back to process.env validation.
      }
    }
  }
}

export function parseApiConfig(
  rawEnv: Record<string, string | undefined> = process.env,
): ApiConfig {
  const parsed = envSchema.parse(rawEnv);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    appOrigin: new URL(parsed.APP_ORIGIN).origin,
    cookieSecure: parsed.COOKIE_SECURE,
    ...(parsed.COOKIE_DOMAIN ? { cookieDomain: parsed.COOKIE_DOMAIN } : {}),
    supabaseUrl: parsed.SUPABASE_URL.replace(/\/+$/, ''),
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
  };
}

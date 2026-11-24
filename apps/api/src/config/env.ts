import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const MIN_PROD_RECEIPT_SECRET_LENGTH = 32;

const nonEmptyOptionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    APP_ORIGIN: z.url().default('http://localhost:5173'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    COOKIE_DOMAIN: nonEmptyOptionalString,
    RECEIPT_SIGNING_SECRET: nonEmptyOptionalString,
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    ENABLE_DEMO_RESET: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SUPABASE_URL: z.url().default('http://127.0.0.1:55321'),
    SUPABASE_PUBLISHABLE_KEY: nonEmptyOptionalString,
    SUPABASE_SECRET_KEY: nonEmptyOptionalString,
    SUPABASE_ANON_KEY: nonEmptyOptionalString,
    SUPABASE_SERVICE_ROLE_KEY: nonEmptyOptionalString,
  })
  .superRefine((env, ctx) => {
    if (!(env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_PUBLISHABLE_KEY'],
        message: 'SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_ANON_KEY) is required.',
      });
    }
    if (!(env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_SECRET_KEY'],
        message: 'SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is required.',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      (!env.RECEIPT_SIGNING_SECRET ||
        env.RECEIPT_SIGNING_SECRET.length < MIN_PROD_RECEIPT_SECRET_LENGTH)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['RECEIPT_SIGNING_SECRET'],
        message: `RECEIPT_SIGNING_SECRET must be at least ${MIN_PROD_RECEIPT_SECRET_LENGTH} characters in production.`,
      });
    }
  });

export type ApiConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appOrigin: string;
  cookieSecure: boolean;
  cookieDomain?: string;
  receiptSigningSecret: string;
  trustProxy: boolean;
  enableDemoReset: boolean;
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
  const normalizedSupabaseUrl = parsed.SUPABASE_URL.replace(/\/+$/, '');
  const supabaseAnonKey = parsed.SUPABASE_PUBLISHABLE_KEY ?? parsed.SUPABASE_ANON_KEY ?? '';
  const supabaseServiceRoleKey =
    parsed.SUPABASE_SECRET_KEY ?? parsed.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const receiptSigningSecret =
    parsed.RECEIPT_SIGNING_SECRET ??
    createHash('sha256')
      .update(`menu-kiosk-dev-receipt-secret:${normalizedSupabaseUrl}`)
      .digest('hex');

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    appOrigin: new URL(parsed.APP_ORIGIN).origin,
    cookieSecure: parsed.COOKIE_SECURE,
    ...(parsed.COOKIE_DOMAIN ? { cookieDomain: parsed.COOKIE_DOMAIN } : {}),
    receiptSigningSecret,
    trustProxy: parsed.TRUST_PROXY,
    enableDemoReset: parsed.ENABLE_DEMO_RESET,
    supabaseUrl: normalizedSupabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  };
}

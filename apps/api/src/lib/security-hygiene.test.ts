import { describe, expect, it } from 'vitest';
import { parseApiConfig } from '../config/env';
import { SlidingWindowRateLimiter, extractClientIp } from './rate-limit';

const BASE_ENV = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
};

describe('Phase 4 security config, trusted-proxy IP extraction, and bounded rate limiter', () => {
  it('requires a >=32 char RECEIPT_SIGNING_SECRET in production and uses a deterministic fallback in dev/test', () => {
    const devA = parseApiConfig({ ...BASE_ENV, NODE_ENV: 'development' });
    const devB = parseApiConfig({ ...BASE_ENV, NODE_ENV: 'development' });
    expect(devA.receiptSigningSecret).toBe(devB.receiptSigningSecret);
    expect(devA.receiptSigningSecret.length).toBeGreaterThanOrEqual(32);
    expect(devA.receiptSigningSecret).not.toBe(BASE_ENV.SUPABASE_SERVICE_ROLE_KEY);
    expect(devA.trustProxy).toBe(false);
    expect(devA.enableDemoReset).toBe(false);

    expect(() =>
      parseApiConfig({
        ...BASE_ENV,
        NODE_ENV: 'production',
      }),
    ).toThrow(/RECEIPT_SIGNING_SECRET/);

    expect(() =>
      parseApiConfig({
        ...BASE_ENV,
        NODE_ENV: 'production',
        RECEIPT_SIGNING_SECRET: 'too-short-secret',
      }),
    ).toThrow(/RECEIPT_SIGNING_SECRET/);

    const prod = parseApiConfig({
      ...BASE_ENV,
      NODE_ENV: 'production',
      RECEIPT_SIGNING_SECRET: 'a-very-strong-production-receipt-signing-secret-1234',
      TRUST_PROXY: 'true',
      ENABLE_DEMO_RESET: 'true',
    });
    expect(prod.receiptSigningSecret).toBe('a-very-strong-production-receipt-signing-secret-1234');
    expect(prod.trustProxy).toBe(true);
    expect(prod.enableDemoReset).toBe(true);
  });

  it('supports SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY with legacy fallback', () => {
    const modern = parseApiConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
      SUPABASE_SECRET_KEY: 'sb_secret_test_key',
    });
    expect(modern.supabaseAnonKey).toBe('sb_publishable_test_key');
    expect(modern.supabaseServiceRoleKey).toBe('sb_secret_test_key');

    const prefersModern = parseApiConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preferred',
      SUPABASE_SECRET_KEY: 'sb_secret_preferred',
      SUPABASE_ANON_KEY: 'legacy-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role',
    });
    expect(prefersModern.supabaseAnonKey).toBe('sb_publishable_preferred');
    expect(prefersModern.supabaseServiceRoleKey).toBe('sb_secret_preferred');

    expect(() =>
      parseApiConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: '   ',
        SUPABASE_SECRET_KEY: 'sb_secret_test_key',
      }),
    ).toThrow(/SUPABASE_PUBLISHABLE_KEY/);

    expect(() =>
      parseApiConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
      }),
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it('ignores proxy forwarding headers when TRUST_PROXY is false and extracts forwarded IP when true', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      'x-real-ip': '203.0.113.99',
    });

    expect(extractClientIp(headers, false)).toBe('direct');
    expect(extractClientIp(headers, true)).toBe('203.0.113.10');

    const realIpOnly = new Headers({ 'x-real-ip': '198.51.100.7' });
    expect(extractClientIp(realIpOnly, false)).toBe('direct');
    expect(extractClientIp(realIpOnly, true)).toBe('198.51.100.7');
  });

  it('evicts expired and oldest buckets in SlidingWindowRateLimiter when maxBuckets is reached', () => {
    let nowMs = 1_000;
    const limiter = new SlidingWindowRateLimiter(2, 10_000, () => nowMs, 3);

    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-2').allowed).toBe(true);
    expect(limiter.check('ip-3').allowed).toBe(true);
    expect(limiter.bucketCount).toBe(3);

    // Adding a 4th active bucket evicts the oldest bucket (ip-1) to stay bounded at 3
    expect(limiter.check('ip-4').allowed).toBe(true);
    expect(limiter.bucketCount).toBe(3);

    // Advance past window expiry -> inserting ip-5 sweeps expired buckets first
    nowMs += 20_000;
    expect(limiter.check('ip-5').allowed).toBe(true);
    expect(limiter.bucketCount).toBe(1);
  });
});

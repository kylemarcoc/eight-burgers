import type { MiddlewareHandler } from 'hono';

const PRIVATE_PREFIXES = ['/api/v1/auth', '/api/v1/orders', '/api/v1/admin'];

export const securityHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');

  const path = c.req.path;
  if (PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
  }
};

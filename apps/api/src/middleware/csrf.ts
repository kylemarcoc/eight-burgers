import type { MiddlewareHandler } from 'hono';
import { problemResponse } from '../lib/problem';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createCsrfMiddleware(allowedOrigin: string): MiddlewareHandler {
  const expectedOrigin = new URL(allowedOrigin).origin;

  return async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method.toUpperCase())) {
      await next();
      return;
    }

    const requestedWith = c.req.header('x-requested-with');
    if (requestedWith !== 'fetch') {
      return problemResponse(c, {
        status: 403,
        code: 'CSRF_HEADER_REQUIRED',
        title: 'Forbidden',
        detail: 'Missing required X-Requested-With header.',
      });
    }

    const originHeader = c.req.header('origin');
    const refererHeader = c.req.header('referer');
    let candidateOrigin: string | null = null;

    if (originHeader) {
      try {
        candidateOrigin = new URL(originHeader).origin;
      } catch {
        candidateOrigin = null;
      }
    } else if (refererHeader) {
      try {
        candidateOrigin = new URL(refererHeader).origin;
      } catch {
        candidateOrigin = null;
      }
    }

    if (candidateOrigin !== expectedOrigin) {
      return problemResponse(c, {
        status: 403,
        code: 'CSRF_ORIGIN_MISMATCH',
        title: 'Forbidden',
        detail: 'Request origin is not permitted for this operation.',
      });
    }

    await next();
  };
}

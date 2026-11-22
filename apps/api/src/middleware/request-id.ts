import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._-]{4,64}$/;

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header('x-request-id');
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  c.set('requestId', requestId);
  await next();
  c.header('X-Request-Id', requestId);
};

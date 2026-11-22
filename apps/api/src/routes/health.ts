import { Hono } from 'hono';
import { problemResponse } from '../lib/problem';
import type { ApiDeps, ApiEnv } from '../types';

export function createHealthRoutes(deps: Pick<ApiDeps, 'gateway'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.get('/healthz', (c) => c.json({ status: 'ok' }, 200));

  app.get('/readyz', async (c) => {
    try {
      const ready = await deps.gateway.checkDatabaseReady();
      if (!ready) {
        return problemResponse(c, {
          status: 503,
          code: 'DATABASE_UNAVAILABLE',
          title: 'Service Unavailable',
          detail: 'Local Supabase database is not reachable.',
        });
      }
      return c.json({ status: 'ready' }, 200);
    } catch {
      return problemResponse(c, {
        status: 503,
        code: 'DATABASE_UNAVAILABLE',
        title: 'Service Unavailable',
        detail: 'Local Supabase database is not reachable.',
      });
    }
  });

  return app;
}

import { Hono } from 'hono';
import { problemResponse } from './lib/problem';
import { createCsrfMiddleware } from './middleware/csrf';
import { requestIdMiddleware } from './middleware/request-id';
import { createRequireAdminMiddleware } from './middleware/require-admin';
import { securityHeadersMiddleware } from './middleware/security-headers';
import { createAdminDeliveryRoutes } from './routes/admin-delivery';
import { createAdminMenuRoutes } from './routes/admin-menu';
import { createAdminOrderRoutes } from './routes/admin-orders';
import { createAuthRoutes } from './routes/auth';
import { createCatalogRoutes } from './routes/catalog';
import { createHealthRoutes } from './routes/health';
import { createOrderRoutes } from './routes/orders';
import type { ApiDeps, ApiEnv } from './types';

export function createApp(deps: ApiDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.use('*', requestIdMiddleware);
  app.use('*', securityHeadersMiddleware);
  app.use('/api/*', createCsrfMiddleware(deps.config.appOrigin));

  app.route('/', createHealthRoutes(deps));

  const apiV1 = new Hono<ApiEnv>();
  apiV1.route('/', createCatalogRoutes(deps));
  apiV1.route('/', createOrderRoutes(deps));
  apiV1.route('/', createAuthRoutes(deps));

  const adminV1 = new Hono<ApiEnv>();
  adminV1.use('*', createRequireAdminMiddleware(deps));
  adminV1.route('/', createAdminMenuRoutes(deps));
  adminV1.route('/', createAdminDeliveryRoutes(deps));
  adminV1.route('/', createAdminOrderRoutes(deps));

  apiV1.route('/admin', adminV1);
  app.route('/api/v1', apiV1);

  app.notFound((c) =>
    problemResponse(c, {
      status: 404,
      code: 'NOT_FOUND',
      title: 'Not Found',
      detail: 'The requested API endpoint does not exist.',
    }),
  );

  app.onError((err, c) => {
    if (deps.config.nodeEnv !== 'test') {
      const requestId = c.get('requestId') ?? 'unknown';
      console.error(`[api] unhandled error requestId=${requestId}`, err.message);
    }
    return problemResponse(c, {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred while processing the request.',
    });
  });

  return app;
}

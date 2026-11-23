import { Hono } from 'hono';
import { problemResponse } from './lib/problem';
import { createStoreProfileCache } from './lib/store-profile-cache';
import { createCsrfMiddleware } from './middleware/csrf';
import { requestIdMiddleware } from './middleware/request-id';
import { createRequireAdminMiddleware } from './middleware/require-admin';
import { securityHeadersMiddleware } from './middleware/security-headers';
import { createAdminCategoryRoutes } from './routes/admin-categories';
import { createAdminDeliveryRoutes } from './routes/admin-delivery';
import { createAdminMenuRoutes } from './routes/admin-menu';
import { createAdminOptionRoutes } from './routes/admin-options';
import { createAdminOrderRoutes } from './routes/admin-orders';
import { createAdminStoreRoutes } from './routes/admin-store';
import { createAdminUserRoutes } from './routes/admin-users';
import { createAuthRoutes } from './routes/auth';
import { createCatalogRoutes } from './routes/catalog';
import { createHealthRoutes } from './routes/health';
import { createLocationRoutes } from './routes/location';
import { createOrderRoutes } from './routes/orders';
import type { ApiDeps, ApiEnv } from './types';

export function createApp(deps: ApiDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const storeProfileCache =
    deps.storeProfileCache ?? createStoreProfileCache(() => deps.gateway.getStoreProfile());
  const sharedDeps: ApiDeps = { ...deps, storeProfileCache };

  app.use('*', requestIdMiddleware);
  app.use('*', securityHeadersMiddleware);
  app.use('/api/*', createCsrfMiddleware(deps.config.appOrigin));

  app.route('/', createHealthRoutes(sharedDeps));

  const apiV1 = new Hono<ApiEnv>();
  apiV1.route('/', createCatalogRoutes(sharedDeps));
  apiV1.route('/', createLocationRoutes(sharedDeps));
  apiV1.route('/', createOrderRoutes(sharedDeps));
  apiV1.route('/', createAuthRoutes(sharedDeps));

  const adminV1 = new Hono<ApiEnv>();
  adminV1.use('*', createRequireAdminMiddleware(sharedDeps));
  adminV1.route('/', createAdminCategoryRoutes(sharedDeps));
  adminV1.route('/', createAdminOptionRoutes(sharedDeps));
  adminV1.route('/', createAdminMenuRoutes(sharedDeps));
  adminV1.route('/', createAdminDeliveryRoutes(sharedDeps));
  adminV1.route('/', createAdminStoreRoutes(sharedDeps));
  adminV1.route('/', createAdminOrderRoutes(sharedDeps));
  adminV1.route('/', createAdminUserRoutes(sharedDeps));

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
      const errName = err instanceof Error ? err.name : 'Error';
      const rawCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? (err as { code?: unknown }).code
          : undefined;
      const errCode =
        typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : 'UNKNOWN';
      console.error(
        `[api] unhandled error requestId=${requestId} method=${c.req.method} path=${c.req.path} name=${errName} code=${errCode}`,
      );
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

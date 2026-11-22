import type { MiddlewareHandler } from 'hono';
import { refreshAdminSessionSingleFlight } from '../lib/auth-refresh';
import { clearAuthCookies, readAuthCookies, setAuthCookies } from '../lib/cookies';
import { problemResponse } from '../lib/problem';
import type { ApiDeps, ApiEnv } from '../types';

export function createRequireAdminMiddleware(
  deps: Pick<ApiDeps, 'config' | 'gateway'>,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const { accessToken, refreshToken } = readAuthCookies(c);

    if (accessToken) {
      const user = await deps.gateway.verifyAccessToken(accessToken);
      if (user) {
        c.set('adminUser', user);
        c.set('adminAccessToken', accessToken);
        await next();
        return;
      }
    }

    if (refreshToken) {
      const refreshed = await refreshAdminSessionSingleFlight(deps.gateway, refreshToken);
      if (refreshed) {
        setAuthCookies(c, deps.config, refreshed.tokens);
        c.set('adminUser', refreshed.user);
        c.set('adminAccessToken', refreshed.tokens.accessToken);
        await next();
        return;
      }
    }

    if (accessToken || refreshToken) {
      clearAuthCookies(c, deps.config);
    }

    return problemResponse(c, {
      status: 401,
      code: 'UNAUTHENTICATED',
      title: 'Unauthorized',
      detail: 'Owner admin sign-in is required to access this resource.',
    });
  };
}

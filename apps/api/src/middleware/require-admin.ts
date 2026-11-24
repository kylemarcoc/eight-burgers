import { hasAdminRole, type AdminRole } from '@menu-kiosk/contracts';
import type { MiddlewareHandler } from 'hono';
import { verifyAdminAccessToken } from '../lib/admin-auth-cache';
import { refreshAdminSessionSingleFlight } from '../lib/auth-refresh';
import { clearAuthCookies, readAuthCookies, setAuthCookies } from '../lib/cookies';
import { problemResponse } from '../lib/problem';
import type { ApiDeps, ApiEnv } from '../types';

export function createRequireAdminMiddleware(
  deps: Pick<ApiDeps, 'config' | 'gateway' | 'adminAuthCache'>,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const { accessToken, refreshToken } = readAuthCookies(c);

    if (accessToken) {
      const user = await verifyAdminAccessToken(deps, accessToken);
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
      detail: 'Staff Portal sign-in is required to access this resource.',
    });
  };
}

export function createRequireAdminRolesMiddleware(
  allowedRoles: readonly AdminRole[],
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const adminUser = c.get('adminUser');
    if (!adminUser) {
      return problemResponse(c, {
        status: 401,
        code: 'UNAUTHENTICATED',
        title: 'Unauthorized',
        detail: 'Staff Portal sign-in is required to access this resource.',
      });
    }

    if (!hasAdminRole(adminUser.role, allowedRoles)) {
      return problemResponse(c, {
        status: 403,
        code: 'INSUFFICIENT_ROLE',
        title: 'Forbidden',
        detail: 'Your Staff Portal role does not have permission to perform this action.',
      });
    }

    await next();
  };
}

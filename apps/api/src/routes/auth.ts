import { adminLoginRequestSchema } from '@menu-kiosk/contracts';
import { Hono } from 'hono';
import { refreshAdminSessionSingleFlight } from '../lib/auth-refresh';
import { clearAuthCookies, readAuthCookies, setAuthCookies } from '../lib/cookies';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { SlidingWindowRateLimiter, extractClientIp } from '../lib/rate-limit';
import type { ApiDeps, ApiEnv } from '../types';

export function createAuthRoutes(deps: ApiDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const limiter = deps.loginRateLimiter ?? new SlidingWindowRateLimiter(10, 5 * 60_000);

  app.post('/auth/login', async (c) => {
    const clientIp = extractClientIp(c.req.raw.headers, deps.config.trustProxy);
    const ipDecision = limiter.check(`login:ip:${clientIp}`);
    if (!ipDecision.allowed) {
      c.header('Retry-After', String(ipDecision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many sign-in attempts. Please try again shortly.',
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_JSON',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }

    const parsed = adminLoginRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Enter a valid admin email and password.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const accountDecision = limiter.check(`login:account:${normalizedEmail}`);
    if (!accountDecision.allowed) {
      c.header('Retry-After', String(accountDecision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many sign-in attempts for this account. Please try again shortly.',
      });
    }

    const result = await deps.gateway.signInAdmin(normalizedEmail, parsed.data.password);
    if (result.status === 'invalid_credentials') {
      clearAuthCookies(c, deps.config);
      return problemResponse(c, {
        status: 401,
        code: 'INVALID_CREDENTIALS',
        title: 'Unauthorized',
        detail: 'Invalid email or password.',
      });
    }

    if (result.status === 'forbidden') {
      clearAuthCookies(c, deps.config);
      return problemResponse(c, {
        status: 403,
        code: 'ADMIN_FORBIDDEN',
        title: 'Forbidden',
        detail: 'This account does not have active Staff Portal permissions.',
      });
    }

    setAuthCookies(c, deps.config, result.tokens);
    return c.json(
      {
        data: {
          authenticated: true,
          user: result.user,
        },
      },
      200,
    );
  });

  app.get('/auth/session', async (c) => {
    const { accessToken, refreshToken } = readAuthCookies(c);

    if (accessToken) {
      const user = await deps.gateway.verifyAccessToken(accessToken);
      if (user) {
        return c.json({ data: { authenticated: true, user } }, 200);
      }
    }

    if (refreshToken) {
      const refreshed = await refreshAdminSessionSingleFlight(deps.gateway, refreshToken);
      if (refreshed) {
        setAuthCookies(c, deps.config, refreshed.tokens);
        return c.json({ data: { authenticated: true, user: refreshed.user } }, 200);
      }
    }

    if (accessToken || refreshToken) {
      clearAuthCookies(c, deps.config);
    }

    return c.json({ data: { authenticated: false, user: null } }, 200);
  });

  app.post('/auth/refresh', async (c) => {
    const { refreshToken } = readAuthCookies(c);
    if (!refreshToken) {
      clearAuthCookies(c, deps.config);
      return problemResponse(c, {
        status: 401,
        code: 'UNAUTHENTICATED',
        title: 'Unauthorized',
        detail: 'No active refresh token found.',
      });
    }

    const refreshed = await refreshAdminSessionSingleFlight(deps.gateway, refreshToken);
    if (!refreshed) {
      clearAuthCookies(c, deps.config);
      return problemResponse(c, {
        status: 401,
        code: 'SESSION_EXPIRED',
        title: 'Unauthorized',
        detail: 'Staff Portal session expired. Please sign in again.',
      });
    }

    setAuthCookies(c, deps.config, refreshed.tokens);
    return c.json({ data: { authenticated: true, user: refreshed.user } }, 200);
  });

  app.post('/auth/logout', async (c) => {
    const { accessToken } = readAuthCookies(c);
    if (accessToken) {
      await deps.gateway.signOutAdmin(accessToken);
    }
    clearAuthCookies(c, deps.config);
    return c.body(null, 204);
  });

  return app;
}

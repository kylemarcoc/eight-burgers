import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { ApiConfig } from '../config/env';

export const ACCESS_TOKEN_COOKIE = 'mk_access_token';
export const REFRESH_TOKEN_COOKIE = 'mk_refresh_token';

const COOKIE_PATH = '/api';
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthCookieTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number;
};

export function readAuthCookies(c: Context): {
  accessToken: string | undefined;
  refreshToken: string | undefined;
} {
  return {
    accessToken: getCookie(c, ACCESS_TOKEN_COOKIE),
    refreshToken: getCookie(c, REFRESH_TOKEN_COOKIE),
  };
}

export function setAuthCookies(
  c: Context,
  config: Pick<ApiConfig, 'cookieSecure' | 'cookieDomain'>,
  tokens: AuthCookieTokens,
): void {
  const baseOptions = {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: config.cookieSecure,
    path: COOKIE_PATH,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };

  setCookie(c, ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseOptions,
    maxAge: Math.max(60, Math.round(tokens.expiresInSeconds ?? 3600)),
  });

  setCookie(c, REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseOptions,
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
}

export function clearAuthCookies(
  c: Context,
  config: Pick<ApiConfig, 'cookieSecure' | 'cookieDomain'>,
): void {
  const baseOptions = {
    path: COOKIE_PATH,
    secure: config.cookieSecure,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
  deleteCookie(c, ACCESS_TOKEN_COOKIE, baseOptions);
  deleteCookie(c, REFRESH_TOKEN_COOKIE, baseOptions);
}

import type { Hono } from 'hono';
import { createApp } from './app';
import { loadLocalEnvFiles, parseApiConfig } from './config/env';
import { createSupabaseGateway } from './lib/supabase';
import type { ApiDeps, ApiEnv } from './types';

const VERCEL_PATH_PARAM = '__vercel_path';
const VERCEL_REWRITE_DESTINATIONS = new Set(['/api', '/api/index']);

type NodeRequestInit = RequestInit & { duplex?: 'half' };

function isAllowedVercelTargetPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (path.includes('?') || path.includes('#') || path.includes('..')) return false;
  return path === '/healthz' || path === '/readyz' || path === '/api' || path.startsWith('/api/');
}

/**
 * Restores the original request pathname when Vercel rewrites `/api/*`, `/healthz`,
 * or `/readyz` to `/api/index?__vercel_path=...` while preserving all other query params.
 */
export function restoreVercelRequest(request: Request): Request {
  const url = new URL(request.url);
  if (!url.searchParams.has(VERCEL_PATH_PARAM)) {
    return request;
  }

  const rawTargetPath = url.searchParams.get(VERCEL_PATH_PARAM)?.trim() ?? '';
  url.searchParams.delete(VERCEL_PATH_PARAM);

  if (VERCEL_REWRITE_DESTINATIONS.has(url.pathname) && isAllowedVercelTargetPath(rawTargetPath)) {
    url.pathname = rawTargetPath;
  }

  const init: NodeRequestInit = {
    method: request.method,
    headers: request.headers,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null) {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

/**
 * Builds a lazy, module-cached Web-Standard fetch handler for Vercel Node.js Functions.
 */
export function createVercelHandler(deps?: Partial<ApiDeps>): {
  fetch: (request: Request) => Response | Promise<Response>;
} {
  let cachedApp: Hono<ApiEnv> | null = null;

  const getApp = (): Hono<ApiEnv> => {
    if (!cachedApp) {
      if (!deps?.config || !deps?.gateway) {
        loadLocalEnvFiles();
      }
      const config = deps?.config ?? parseApiConfig(process.env);
      const gateway = deps?.gateway ?? createSupabaseGateway(config);
      cachedApp = createApp({
        ...deps,
        config,
        gateway,
      });
    }
    return cachedApp;
  };

  return {
    fetch(request: Request): Response | Promise<Response> {
      const normalizedRequest = restoreVercelRequest(request);
      return getApp().fetch(normalizedRequest);
    },
  };
}

export default createVercelHandler();

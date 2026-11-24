import { problemDetailSchema } from '@menu-kiosk/contracts';
import type { z } from 'zod';
import { beginForegroundRequest } from './api-activity';
import { ApiError } from './api-error';

const DEFAULT_TIMEOUT_MS = 12_000;

export function resolveApiBaseUrl(raw?: string): string {
  const candidate = (raw ?? import.meta.env.VITE_API_BASE_URL ?? '/api/v1').trim();
  if (!candidate) return '/api/v1';

  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate.replace(/\/+$/, '');
  }

  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password
    ) {
      return candidate.replace(/\/+$/, '');
    }
  } catch {
    // Fall through to throw explicit error
  }

  throw new Error(`Invalid VITE_API_BASE_URL configuration: "${candidate}"`);
}

export function parseRetryAfterMs(
  headerValue: string | null,
  nowMs = Date.now(),
): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;

  const numericSeconds = Number(trimmed);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return Math.round(numericSeconds * 1000);
  }

  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - nowMs);
  }

  return undefined;
}

export type HttpRequestOptions<T> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  schema?: z.ZodType<T>;
  baseUrl?: string;
  trackForeground?: boolean;
};

export async function apiRequest<T = void>(
  path: string,
  options: HttpRequestOptions<T> = {},
): Promise<T> {
  const baseUrl = resolveApiBaseUrl(options.baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}`;
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers = new Headers({
    Accept: 'application/json',
    'X-Requested-With': 'fetch',
    ...options.headers,
  });

  let serializedBody: BodyInit | undefined;
  if (options.body instanceof FormData) {
    serializedBody = options.body;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    serializedBody = JSON.stringify(options.body);
  }

  if (options.signal?.aborted) {
    throw new ApiError({ kind: 'cancelled', message: 'Request was cancelled.' });
  }

  const endForeground = options.trackForeground ? beginForegroundRequest() : null;
  try {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => {
      controller.abort();
    };

    if (options.signal) {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: serializedBody,
        credentials: 'same-origin',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new ApiError({
          kind: 'timeout',
          message: 'The request timed out. Please try again.',
        });
      }
      if (
        options.signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        throw new ApiError({
          kind: 'cancelled',
          message: 'Request was cancelled.',
        });
      }
      throw new ApiError({
        kind: 'network',
        message: 'Unable to reach the server. Check your connection and try again.',
      });
    } finally {
      globalThis.clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    const rawText = await response.text();
    let parsedJson: unknown = null;
    if (rawText.trim().length > 0) {
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        if (!response.ok) {
          throw new ApiError({
            kind: 'http',
            status: response.status,
            code: 'HTTP_ERROR',
            message: `Request failed with status ${response.status}.`,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
          });
        }
        throw new ApiError({
          kind: 'validation',
          message: 'Received an unexpected non-JSON response from the server.',
          issues: rawText.slice(0, 200),
        });
      }
    }

    if (!response.ok) {
      const problemParsed = problemDetailSchema.safeParse(parsedJson);
      if (problemParsed.success) {
        const problem = problemParsed.data;
        throw new ApiError({
          kind: 'http',
          status: problem.status,
          code: problem.code,
          message: problem.detail,
          ...(problem.requestId ? { requestId: problem.requestId } : {}),
          ...(problem.fieldErrors ? { fieldErrors: problem.fieldErrors } : {}),
          ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
          problem,
        });
      }

      throw new ApiError({
        kind: 'http',
        status: response.status,
        code: 'HTTP_ERROR',
        message: `Request failed with status ${response.status}.`,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      });
    }

    if (!options.schema) {
      return parsedJson as T;
    }

    const validated = options.schema.safeParse(parsedJson);
    if (!validated.success) {
      throw new ApiError({
        kind: 'validation',
        message: 'Server response did not match the expected format.',
        issues: validated.error.issues,
      });
    }

    return validated.data;
  } finally {
    endForeground?.();
  }
}

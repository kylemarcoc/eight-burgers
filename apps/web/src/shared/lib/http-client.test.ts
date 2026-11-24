import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useForegroundRequestCount } from './api-activity';
import { isApiError } from './api-error';
import { apiRequest, parseRetryAfterMs } from './http-client';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('http-client', () => {
  it('validates JSON payloads with Zod and attaches standard security headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await apiRequest('/catalog', {
      schema: z.object({ data: z.object({ ok: z.boolean() }) }),
    });

    expect(result).toEqual({ data: { ok: true } });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/catalog');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.redirect).toBe('error');
    const headers = init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers instanceof Headers ? headers.get('x-requested-with') : null).toBe('fetch');
  });

  it('handles 204 No Content without parsing JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await apiRequest('/auth/logout', { method: 'POST' });
    expect(result).toBeUndefined();
  });

  it('normalizes RFC 9457 Problem Details and Retry-After headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: 'https://eight-burgers.local/problems/rate_limited',
          title: 'Too Many Requests',
          status: 429,
          code: 'RATE_LIMITED',
          detail: 'Slow down.',
          requestId: 'req-123',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/problem+json',
            'Retry-After': '15',
          },
        },
      ),
    );

    try {
      await apiRequest('/orders', { method: 'POST', body: {} });
      expect.unreachable('Expected ApiError');
    } catch (error) {
      expect(isApiError(error)).toBe(true);
      if (isApiError(error) && error.failure.kind === 'http') {
        expect(error.failure.status).toBe(429);
        expect(error.failure.code).toBe('RATE_LIMITED');
        expect(error.failure.retryAfterMs).toBe(15_000);
        expect(error.failure.requestId).toBe('req-123');
      }
    }

    expect(parseRetryAfterMs('5')).toBe(5000);
    expect(
      parseRetryAfterMs(
        'Wed, 21 Oct 2026 07:28:00 GMT',
        Date.parse('Wed, 21 Oct 2026 07:27:50 GMT'),
      ),
    ).toBe(10_000);
  });

  it('classifies malformed JSON and schema mismatches as validation errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('not-json', { status: 200 }));

    await expect(
      apiRequest('/catalog', { schema: z.object({ data: z.string() }) }),
    ).rejects.toMatchObject({ kind: 'validation' });
  });

  it('distinguishes caller AbortSignal cancellation from request timeouts', async () => {
    const externalController = new AbortController();
    externalController.abort();

    await expect(
      apiRequest('/catalog', { signal: externalController.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled' });

    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const pending = apiRequest('/catalog', { timeoutMs: 500 });
    const expectation = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(600);
    await expectation;
  });

  it('sends FormData bodies without overriding Content-Type while preserving CSRF headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const formData = new FormData();
    formData.append('file', new File(['abc'], 'photo.png', { type: 'image/png' }));

    await apiRequest('/admin/menu-images', { method: 'POST', body: formData });
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(init?.body).toBe(formData);
    const headers = init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers instanceof Headers ? headers.get('content-type') : null).toBeNull();
    expect(headers instanceof Headers ? headers.get('x-requested-with') : null).toBe('fetch');
  });

  it('tracks foreground activity when trackForeground is true and decrements on settle or error', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useForegroundRequestCount());
    expect(result.current).toBe(0);

    let resolveFetch!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    let pending!: Promise<unknown>;
    act(() => {
      pending = apiRequest('/location/search?q=makati', { trackForeground: true });
    });
    expect(result.current).toBe(1);

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ data: [] }), { status: 200 }));
      await pending;
    });
    expect(result.current).toBe(0);

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => {
      await expect(
        apiRequest('/location/search?q=makati', { trackForeground: true }),
      ).rejects.toMatchObject({ kind: 'network' });
    });
    expect(result.current).toBe(0);
  });
});

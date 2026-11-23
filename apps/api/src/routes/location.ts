import { geoCoordinatesSchema } from '@eight-burgers/contracts';
import { Hono } from 'hono';
import { createOsmLocationProvider } from '../lib/location-provider';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { SlidingWindowRateLimiter } from '../lib/rate-limit';
import type { ApiDeps, ApiEnv } from '../types';

function extractClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'local';
}

function parseCoordinateParam(raw: string | undefined): number {
  if (!raw || raw.trim().length === 0) return Number.NaN;
  return Number(raw);
}

export function createLocationRoutes(
  deps: Pick<ApiDeps, 'locationProvider' | 'locationRateLimiter'>,
): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const provider = deps.locationProvider ?? createOsmLocationProvider();
  const limiter = deps.locationRateLimiter ?? new SlidingWindowRateLimiter(60, 60_000);

  app.get('/location/search', async (c) => {
    const decision = limiter.check(`location:${extractClientIp(c.req.raw.headers)}`);
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many address searches. Please wait a moment and try again.',
      });
    }

    const query = c.req.query('q')?.trim() ?? '';
    if (query.length < 2 || query.length > 120) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Provide an address search query between 2 and 120 characters.',
        fieldErrors: {
          q: ['Enter 2 to 120 characters to search for an address.'],
        },
      });
    }

    try {
      const suggestions = await provider.search(query, c.req.raw.signal);
      c.header('Cache-Control', 'public, max-age=300');
      return c.json({ data: suggestions }, 200);
    } catch {
      return problemResponse(c, {
        status: 503,
        code: 'LOCATION_SERVICE_UNAVAILABLE',
        title: 'Service Unavailable',
        detail: 'Address search is temporarily unavailable. Try again or use your device location.',
      });
    }
  });

  app.get('/location/reverse', async (c) => {
    const decision = limiter.check(`location:${extractClientIp(c.req.raw.headers)}`);
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many location lookups. Please wait a moment and try again.',
      });
    }

    const parsed = geoCoordinatesSchema.safeParse({
      lat: parseCoordinateParam(c.req.query('lat')),
      lng: parseCoordinateParam(c.req.query('lng')),
    });
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Provide valid latitude and longitude coordinates.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    let result = null;
    try {
      result = await provider.reverse(parsed.data, c.req.raw.signal);
    } catch {
      result = null;
    }

    c.header('Cache-Control', 'private, max-age=300');
    return c.json({ data: result }, 200);
  });

  return app;
}

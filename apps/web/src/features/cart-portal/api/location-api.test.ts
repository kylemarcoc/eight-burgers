import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApiError } from '@/shared/lib/api-error';
import { reverseGeocodeDeliveryPin, searchDeliveryAddresses } from './location-api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('location-api', () => {
  it('skips search fetches for empty, whitespace-only, or 1-character queries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(await searchDeliveryAddresses('')).toEqual([]);
    expect(await searchDeliveryAddresses('   ')).toEqual([]);
    expect(await searchDeliveryAddresses(' a ')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('trims and URL-encodes search queries and validates suggestions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'osm-w-1',
              label: 'Ayala Triangle Gardens',
              secondaryLabel: 'Bel-Air, Makati',
              coordinates: { lat: 14.5572, lng: 121.0236 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const results = await searchDeliveryAddresses('  Ayala & Makati  ');
    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe('Ayala Triangle Gardens');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/location/search?q=Ayala+%26+Makati',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects malformed location search responses with validation ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'bad-coords',
              label: 'Invalid Coords',
              coordinates: { lat: 95, lng: 121.02 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    let caught: unknown;
    try {
      await searchDeliveryAddresses('Ayala');
    } catch (error) {
      caught = error;
    }

    expect(isApiError(caught)).toBe(true);
    if (isApiError(caught)) {
      expect(caught.kind).toBe('validation');
    }
  });

  it('surfaces 503 and 429 Retry-After problem details and cancelled AbortSignals cleanly', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: 'https://eight-burgers.local/problems/location_service_unavailable',
            title: 'Service Unavailable',
            status: 503,
            code: 'LOCATION_SERVICE_UNAVAILABLE',
            detail: 'Address search is temporarily unavailable.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: 'https://eight-burgers.local/problems/rate_limited',
            title: 'Too Many Requests',
            status: 429,
            code: 'RATE_LIMITED',
            detail: 'Too many address searches.',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/problem+json',
              'Retry-After': '5',
            },
          },
        ),
      );

    await expect(searchDeliveryAddresses('Makati')).rejects.toMatchObject({
      kind: 'http',
      status: 503,
      code: 'LOCATION_SERVICE_UNAVAILABLE',
    });

    await expect(searchDeliveryAddresses('BGC')).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterMs: 5000,
    });

    const controller = new AbortController();
    controller.abort();
    await expect(searchDeliveryAddresses('Ortigas', controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
  });

  it('resolves reverse geocode labels, handles null payloads, and rejects malformed payloads', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              label: '215 Chino Roces Avenue, Makati',
              coordinates: { lat: 14.5608, lng: 121.0124 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { label: '', coordinates: { lat: 14.5, lng: 121 } } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

    expect(await reverseGeocodeDeliveryPin({ lat: 14.5608, lng: 121.0124 })).toBe(
      '215 Chino Roces Avenue, Makati',
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/location/reverse?lat=14.5608&lng=121.0124',
      expect.objectContaining({ method: 'GET' }),
    );

    expect(await reverseGeocodeDeliveryPin({ lat: 14.55, lng: 121.02 })).toBeNull();

    await expect(reverseGeocodeDeliveryPin({ lat: 14.55, lng: 121.02 })).rejects.toMatchObject({
      kind: 'validation',
    });
  });
});

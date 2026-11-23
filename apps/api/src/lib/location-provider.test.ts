import { describe, expect, it, vi } from 'vitest';
import { createOsmLocationProvider } from './location-provider';

describe('createOsmLocationProvider', () => {
  it('maps Photon GeoJSON [lng, lat] features, filters non-PH results, deduplicates, and caches search queries', async () => {
    let nowMs = 1_000;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [121.0244, 14.5547] },
              properties: {
                osm_type: 'W',
                osm_id: 101,
                name: 'Ayala Triangle Gardens',
                street: 'Ayala Avenue',
                district: 'Bel-Air',
                city: 'Makati',
                state: 'Metro Manila',
                countrycode: 'PH',
              },
            },
            {
              // Duplicate label + secondaryLabel should be dropped
              geometry: { coordinates: [121.0245, 14.5548] },
              properties: {
                osm_type: 'W',
                osm_id: 102,
                name: 'Ayala Triangle Gardens',
                street: 'Ayala Avenue',
                district: 'Bel-Air',
                city: 'Makati',
                state: 'Metro Manila',
                countrycode: 'PH',
              },
            },
            {
              // Non-PH entry should be filtered out
              geometry: { coordinates: [-122.4194, 37.7749] },
              properties: {
                osm_type: 'N',
                osm_id: 999,
                name: 'Ayala Street',
                city: 'San Francisco',
                countrycode: 'US',
              },
            },
            {
              geometry: { coordinates: [121.0124123, 14.5608123] },
              properties: {
                osm_type: 'N',
                osm_id: 103,
                housenumber: '215',
                street: 'Chino Roces Avenue',
                suburb: 'San Antonio',
                city: 'Makati',
                countrycode: 'PH',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = createOsmLocationProvider({
      fetchImpl: fetchMock,
      now: () => nowMs,
      cacheTtlMs: 60_000,
    });

    const first = await provider.search('  Ayala Makati  ');
    expect(first).toEqual([
      {
        id: 'osm-W-101',
        label: 'Ayala Triangle Gardens',
        secondaryLabel: 'Ayala Avenue, Bel-Air, Makati, Metro Manila',
        coordinates: { lat: 14.5547, lng: 121.0244 },
      },
      {
        id: 'osm-N-103',
        label: '215 Chino Roces Avenue',
        secondaryLabel: 'San Antonio, Makati',
        coordinates: { lat: 14.56081, lng: 121.01241 },
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('https://photon.komoot.io/api/');
    expect(requestUrl).toContain('q=Ayala+Makati');
    expect(requestUrl).toContain('bbox=116.8%2C4.5%2C126.7%2C21.2');

    // Case-insensitive cache hit within TTL does not refetch
    nowMs += 5_000;
    const second = await provider.search('ayala makati');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on upstream HTTP failure during search', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    const provider = createOsmLocationProvider({ fetchImpl: fetchMock });

    await expect(provider.search('Ayala Ave')).rejects.toThrow(/429/);
  });

  it('parses Nominatim reverse labels and returns null gracefully on malformed or failed responses', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            address: {
              house_number: '215',
              road: 'Chino Roces Avenue',
              neighbourhood: 'San Antonio',
              city: 'Makati',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('upstream error', { status: 502 }))
      .mockRejectedValueOnce(new Error('network down'));

    const provider = createOsmLocationProvider({ fetchImpl: fetchMock });

    const resolved = await provider.reverse({ lat: 14.5608, lng: 121.0124 });
    expect(resolved).toEqual({
      label: '215 Chino Roces Avenue, San Antonio, Makati',
      coordinates: { lat: 14.5608, lng: 121.0124 },
    });

    // Different coordinate returns null on 502 and on network failure without throwing
    expect(await provider.reverse({ lat: 14.5, lng: 121.0 })).toBeNull();
    expect(await provider.reverse({ lat: 14.6, lng: 121.1 })).toBeNull();
  });

  it('expires TTL entries, evicts oldest cached queries, and returns cloned results', async () => {
    let nowMs = 1_000;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const q = new URL(String(input)).searchParams.get('q') ?? '';
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [121.02, 14.55] },
              properties: {
                osm_type: 'W',
                osm_id: 1,
                name: `Place ${q}`,
                countrycode: 'PH',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const provider = createOsmLocationProvider({
      fetchImpl: fetchMock,
      now: () => nowMs,
      cacheTtlMs: 10_000,
      maxCacheEntries: 2,
    });

    const firstA = await provider.search('Alpha');
    expect(firstA[0]?.coordinates.lat).toBe(14.55);
    // Mutating returned object must not corrupt cached coordinates
    if (firstA[0]) {
      firstA[0].coordinates.lat = 0;
    }
    const cachedA = await provider.search('Alpha');
    expect(cachedA[0]?.coordinates.lat).toBe(14.55);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Fill cache beyond maxCacheEntries (2) -> Alpha is evicted
    await provider.search('Bravo');
    await provider.search('Charlie');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await provider.search('Alpha');
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // TTL expiration refetches
    nowMs += 10_001;
    await provider.search('Alpha');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('skips malformed Photon features, disambiguates colliding IDs, and caps at 6 suggestions', async () => {
    const validFeatures = Array.from({ length: 8 }, (_, idx) => ({
      geometry: { coordinates: [121.01 + idx * 0.001, 14.56 + idx * 0.001] },
      properties: {
        osm_type: 'W',
        osm_id: 777, // colliding osm_type + osm_id across distinct labels
        name: `Landmark ${idx + 1}`,
        city: 'Makati',
        countrycode: 'PH',
      },
    }));

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            { geometry: {}, properties: { name: 'Missing coords', countrycode: 'PH' } },
            {
              geometry: { coordinates: ['NaN', 14.56] },
              properties: { name: 'Bad coords', countrycode: 'PH' },
            },
            {
              geometry: { coordinates: [121.01, 95] },
              properties: { name: 'Out of range lat', countrycode: 'PH' },
            },
            {
              geometry: { coordinates: [121.01, 14.56] },
              properties: { countrycode: 'PH' }, // missing label
            },
            ...validFeatures,
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = createOsmLocationProvider({ fetchImpl: fetchMock });
    const suggestions = await provider.search('Landmark');

    expect(suggestions).toHaveLength(6);
    expect(suggestions.map((entry) => entry.id)).toEqual([
      'osm-W-777',
      'osm-W-777-2',
      'osm-W-777-3',
      'osm-W-777-4',
      'osm-W-777-5',
      'osm-W-777-6',
    ]);
  });

  it('uses display_name fallback on reverse, clamps labels, avoids caching failures, and honors AbortSignal', async () => {
    const longSegment = 'A'.repeat(140);
    const fetchMock = vi
      .fn<typeof fetch>()
      // 1st reverse: transient 502 (must NOT be cached)
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      // 2nd reverse for same coords: succeeds via display_name fallback + clamp
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            display_name: `${longSegment}, ${longSegment}, Makati, Metro Manila, Philippines`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const provider = createOsmLocationProvider({ fetchImpl: fetchMock });

    expect(await provider.reverse({ lat: 14.555, lng: 121.022 })).toBeNull();
    const retried = await provider.reverse({ lat: 14.555, lng: 121.022 });
    expect(retried).not.toBeNull();
    expect(retried?.label.length).toBeLessThanOrEqual(250);
    expect(retried?.label).toContain('AAAA');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const abortedController = new AbortController();
    abortedController.abort();
    const abortFetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return Promise.resolve(new Response(JSON.stringify({ features: [] }), { status: 200 }));
    });
    const abortProvider = createOsmLocationProvider({ fetchImpl: abortFetchMock });
    await expect(abortProvider.search('Ayala', abortedController.signal)).rejects.toBeTruthy();
    await expect(
      abortProvider.reverse({ lat: 14.56, lng: 121.01 }, abortedController.signal),
    ).rejects.toBeTruthy();
  });
});

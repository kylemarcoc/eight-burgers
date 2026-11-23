import {
  STORE_ORIGIN_COORDS,
  isValidCoordinates,
  type GeoCoordinates,
  type LocationReverseResult,
  type LocationSuggestion,
} from '@eight-burgers/contracts';

export type LocationProvider = {
  search: (query: string, signal?: AbortSignal) => Promise<LocationSuggestion[]>;
  reverse: (coords: GeoCoordinates, signal?: AbortSignal) => Promise<LocationReverseResult | null>;
};

export type OsmLocationProviderOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
};

type PhotonProperties = {
  osm_type?: unknown;
  osm_id?: unknown;
  name?: unknown;
  housenumber?: unknown;
  street?: unknown;
  district?: unknown;
  locality?: unknown;
  suburb?: unknown;
  city?: unknown;
  town?: unknown;
  county?: unknown;
  state?: unknown;
  countrycode?: unknown;
};

type PhotonFeature = {
  geometry?: {
    coordinates?: unknown;
  };
  properties?: PhotonProperties;
};

type NominatimAddressFields = {
  house_number?: unknown;
  road?: unknown;
  neighbourhood?: unknown;
  suburb?: unknown;
  quarter?: unknown;
  village?: unknown;
  city?: unknown;
  town?: unknown;
  municipality?: unknown;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_CACHE_ENTRIES = 200;
const PH_BBOX = '116.8,4.5,126.7,21.2';
const BFF_USER_AGENT = 'eight-burgers-bff/1.0';

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmptyString(values: readonly unknown[]): string | null {
  for (const value of values) {
    const parsed = readNonEmptyString(value);
    if (parsed) return parsed;
  }
  return null;
}

function roundCoord(value: number): number {
  return Number(value.toFixed(5));
}

function parsePhotonFeatures(raw: unknown): LocationSuggestion[] {
  if (typeof raw !== 'object' || raw === null || !('features' in raw)) {
    return [];
  }
  const featuresRaw = (raw as { features?: unknown }).features;
  if (!Array.isArray(featuresRaw)) return [];

  const results: LocationSuggestion[] = [];
  const seenLabels = new Set<string>();
  const seenIds = new Set<string>();

  for (let index = 0; index < featuresRaw.length; index += 1) {
    const feature = featuresRaw[index] as PhotonFeature | null | undefined;
    if (!feature || typeof feature !== 'object') continue;

    const coordsRaw = feature.geometry?.coordinates;
    if (!Array.isArray(coordsRaw) || coordsRaw.length < 2) continue;

    // GeoJSON coordinates are [longitude, latitude].
    const lng = roundCoord(Number(coordsRaw[0]));
    const lat = roundCoord(Number(coordsRaw[1]));
    const coordinates = { lat, lng };
    if (!isValidCoordinates(coordinates)) continue;

    const props =
      typeof feature.properties === 'object' && feature.properties !== null
        ? feature.properties
        : {};

    const countryCode = readNonEmptyString(props.countrycode);
    if (countryCode && countryCode.toUpperCase() !== 'PH') continue;

    const name = readNonEmptyString(props.name);
    const street = readNonEmptyString(props.street);
    const houseNumber = readNonEmptyString(props.housenumber);
    const streetLine = street ? (houseNumber ? `${houseNumber} ${street}` : street) : null;
    const area = firstNonEmptyString([props.district, props.locality, props.suburb]);
    const locality = firstNonEmptyString([props.city, props.town, props.county]);
    const state = readNonEmptyString(props.state);

    const rawLabel = firstNonEmptyString([name, streetLine, area, locality]);
    if (!rawLabel) continue;
    const label = rawLabel.slice(0, 250).trim();
    if (!label) continue;

    const secondaryParts: string[] = [];
    for (const part of [name ? streetLine : null, area, locality, state]) {
      if (
        part &&
        part.toLowerCase() !== label.toLowerCase() &&
        !secondaryParts.some((existing) => existing.toLowerCase() === part.toLowerCase())
      ) {
        secondaryParts.push(part);
      }
    }
    const secondaryLabel = secondaryParts.join(', ').slice(0, 250).trim();

    const dedupeKey = `${label.toLowerCase()}|${secondaryLabel.toLowerCase()}`;
    if (seenLabels.has(dedupeKey)) continue;
    seenLabels.add(dedupeKey);

    const osmType = readNonEmptyString(props.osm_type);
    const osmId =
      typeof props.osm_id === 'number' && Number.isFinite(props.osm_id)
        ? String(props.osm_id)
        : readNonEmptyString(props.osm_id);

    let baseId =
      osmType && osmId
        ? `osm-${osmType}-${osmId}`
        : `photon-${coordinates.lat.toFixed(5)}-${coordinates.lng.toFixed(5)}-${index}`;
    baseId = baseId.slice(0, 190);

    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);

    results.push({
      id,
      label,
      ...(secondaryLabel ? { secondaryLabel } : {}),
      coordinates,
    });

    if (results.length >= 6) break;
  }

  return results;
}

function parseNominatimReverseLabel(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const candidate = raw as {
    address?: unknown;
    display_name?: unknown;
  };

  const parts: string[] = [];
  if (
    typeof candidate.address === 'object' &&
    candidate.address !== null &&
    !Array.isArray(candidate.address)
  ) {
    const addr = candidate.address as NominatimAddressFields;
    const road = readNonEmptyString(addr.road);
    const houseNumber = readNonEmptyString(addr.house_number);
    const street = road ? (houseNumber ? `${houseNumber} ${road}` : road) : null;
    const area = firstNonEmptyString([addr.neighbourhood, addr.suburb, addr.quarter, addr.village]);
    const locality = firstNonEmptyString([addr.city, addr.town, addr.municipality]);

    for (const part of [street, area, locality]) {
      if (part && !parts.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
        parts.push(part);
      }
    }
  }

  let resolved = parts.join(', ').trim();
  if (!resolved) {
    const displayName = readNonEmptyString(candidate.display_name);
    if (displayName) {
      resolved = displayName
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
    }
  }

  if (!resolved) return null;
  return resolved.slice(0, 250).trim() || null;
}

class BoundedTtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    const current = this.now();
    this.entries.delete(key);

    if (this.entries.size >= this.maxEntries) {
      for (const [existingKey, existingEntry] of this.entries) {
        if (existingEntry.expiresAt <= current) {
          this.entries.delete(existingKey);
        }
      }
    }

    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }

    this.entries.set(key, { value, expiresAt: current + this.ttlMs });
  }
}

function createTimedSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

export function createOsmLocationProvider(
  options: OsmLocationProviderOptions = {},
): LocationProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;

  const searchCache = new BoundedTtlCache<LocationSuggestion[]>(ttlMs, maxEntries, now);
  const reverseCache = new BoundedTtlCache<LocationReverseResult | null>(ttlMs, maxEntries, now);

  return {
    async search(query, signal) {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const cacheKey = trimmed.toLowerCase();
      const cached = searchCache.get(cacheKey);
      if (cached) {
        return cached.map((entry) => ({
          ...entry,
          coordinates: { ...entry.coordinates },
        }));
      }

      const url = new URL('https://photon.komoot.io/api/');
      url.searchParams.set('q', trimmed);
      url.searchParams.set('limit', '6');
      url.searchParams.set('lang', 'en');
      url.searchParams.set('lat', String(STORE_ORIGIN_COORDS.lat));
      url.searchParams.set('lon', String(STORE_ORIGIN_COORDS.lng));
      url.searchParams.set('bbox', PH_BBOX);

      const timed = createTimedSignal(timeoutMs, signal);
      try {
        const response = await fetchImpl(url.toString(), {
          method: 'GET',
          signal: timed.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': BFF_USER_AGENT,
          },
        });
        if (!response.ok) {
          throw new Error(`Address search upstream error (${response.status}).`);
        }
        const payload = (await response.json()) as unknown;
        const parsed = parsePhotonFeatures(payload);
        searchCache.set(cacheKey, parsed);
        return parsed.map((entry) => ({
          ...entry,
          coordinates: { ...entry.coordinates },
        }));
      } finally {
        timed.cleanup();
      }
    },

    async reverse(coords, signal) {
      const rounded: GeoCoordinates = {
        lat: roundCoord(coords.lat),
        lng: roundCoord(coords.lng),
      };
      const cacheKey = `${rounded.lat.toFixed(4)},${rounded.lng.toFixed(4)}`;
      const cached = reverseCache.get(cacheKey);
      if (cached !== undefined) {
        return cached ? { ...cached, coordinates: { ...cached.coordinates } } : null;
      }

      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(rounded.lat));
      url.searchParams.set('lon', String(rounded.lng));
      url.searchParams.set('zoom', '18');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('accept-language', 'en');

      const timed = createTimedSignal(timeoutMs, signal);
      try {
        const response = await fetchImpl(url.toString(), {
          method: 'GET',
          signal: timed.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': BFF_USER_AGENT,
          },
        });
        if (!response.ok) {
          return null;
        }
        const payload = (await response.json()) as unknown;
        const label = parseNominatimReverseLabel(payload);
        const result: LocationReverseResult | null = label ? { label, coordinates: rounded } : null;
        reverseCache.set(cacheKey, result);
        return result ? { ...result, coordinates: { ...result.coordinates } } : null;
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        return null;
      } finally {
        timed.cleanup();
      }
    },
  };
}

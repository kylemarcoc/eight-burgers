import type { StoreProfile } from '@menu-kiosk/contracts';

export type StoreProfileCache = {
  get: () => Promise<StoreProfile>;
  invalidate: () => void;
};

export type StoreProfileCacheOptions = {
  ttlMs?: number;
  now?: () => number;
};

const DEFAULT_STORE_PROFILE_TTL_MS = 60_000;

export function createStoreProfileCache(
  loader: () => Promise<StoreProfile>,
  options: StoreProfileCacheOptions = {},
): StoreProfileCache {
  const ttlMs = options.ttlMs ?? DEFAULT_STORE_PROFILE_TTL_MS;
  const now = options.now ?? (() => Date.now());

  let cachedValue: StoreProfile | null = null;
  let expiresAt = 0;
  let inFlight: Promise<StoreProfile> | null = null;
  let generation = 0;

  return {
    async get() {
      if (cachedValue && now() < expiresAt) {
        return cachedValue;
      }

      if (inFlight) {
        return inFlight;
      }

      const loadGeneration = generation;
      const pending = loader()
        .then((profile) => {
          if (generation === loadGeneration) {
            cachedValue = profile;
            expiresAt = now() + ttlMs;
          }
          return profile;
        })
        .finally(() => {
          if (inFlight === pending) {
            inFlight = null;
          }
        });

      inFlight = pending;
      return pending;
    },

    invalidate() {
      generation += 1;
      cachedValue = null;
      expiresAt = 0;
      inFlight = null;
    },
  };
}

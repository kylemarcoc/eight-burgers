import { createHash } from 'node:crypto';
import type { AdminUser } from '@menu-kiosk/contracts';

export type AdminAuthCache = {
  verify: (accessToken: string) => Promise<AdminUser | null>;
  invalidateToken: (accessToken: string) => void;
  invalidateUser: (userId: string) => void;
  clear: () => void;
};

export type AdminAuthCacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
};

type CachedAdminEntry = {
  user: AdminUser;
  expiresAt: number;
};

type InFlightVerification = {
  promise: Promise<AdminUser | null>;
  invalidated: boolean;
  invalidatedUserIds: Set<string>;
};

const DEFAULT_ADMIN_AUTH_TTL_MS = 15_000;
const DEFAULT_MAX_ENTRIES = 256;

function hashAccessToken(accessToken: string): string {
  return createHash('sha256').update(accessToken).digest('hex');
}

function parseJwtExpMs(accessToken: string): number | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;

  try {
    const decoded = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    if (typeof parsed.exp === 'number' && Number.isFinite(parsed.exp)) {
      return parsed.exp * 1000;
    }
  } catch {
    // Non-JWT or malformed payloads fall back to the default TTL.
  }
  return null;
}

export function createAdminAuthCache(
  verifier: (accessToken: string) => Promise<AdminUser | null>,
  options: AdminAuthCacheOptions = {},
): AdminAuthCache {
  const ttlMs = options.ttlMs ?? DEFAULT_ADMIN_AUTH_TTL_MS;
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const now = options.now ?? (() => Date.now());

  const entries = new Map<string, CachedAdminEntry>();
  const inFlight = new Map<string, InFlightVerification>();

  function evictIfNeeded(currentNow: number): void {
    if (entries.size < maxEntries) return;

    for (const [key, entry] of entries) {
      if (currentNow >= entry.expiresAt) {
        entries.delete(key);
      }
    }

    while (entries.size >= maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  return {
    async verify(accessToken) {
      const tokenHash = hashAccessToken(accessToken);
      const currentNow = now();
      const cached = entries.get(tokenHash);

      if (cached) {
        if (currentNow < cached.expiresAt) {
          entries.delete(tokenHash);
          entries.set(tokenHash, cached);
          return cached.user;
        }
        entries.delete(tokenHash);
      }

      const existingInFlight = inFlight.get(tokenHash);
      if (existingInFlight) {
        return existingInFlight.promise;
      }

      const record: InFlightVerification = {
        promise: Promise.resolve(null),
        invalidated: false,
        invalidatedUserIds: new Set<string>(),
      };

      let verifierPromise: Promise<AdminUser | null>;
      try {
        verifierPromise = Promise.resolve(verifier(accessToken));
      } catch (error) {
        verifierPromise = Promise.reject(error);
      }

      const pending = verifierPromise
        .then((user) => {
          if (user && !record.invalidated && !record.invalidatedUserIds.has(user.id)) {
            const verifiedAt = now();
            const jwtExpMs = parseJwtExpMs(accessToken);
            const expiresAt =
              jwtExpMs !== null ? Math.min(verifiedAt + ttlMs, jwtExpMs) : verifiedAt + ttlMs;

            if (verifiedAt < expiresAt) {
              if (!entries.has(tokenHash)) {
                evictIfNeeded(verifiedAt);
              } else {
                entries.delete(tokenHash);
              }
              entries.set(tokenHash, { user, expiresAt });
            }
          }
          return user;
        })
        .finally(() => {
          if (inFlight.get(tokenHash) === record) {
            inFlight.delete(tokenHash);
          }
        });

      record.promise = pending;
      inFlight.set(tokenHash, record);
      return pending;
    },

    invalidateToken(accessToken) {
      const tokenHash = hashAccessToken(accessToken);
      entries.delete(tokenHash);
      const active = inFlight.get(tokenHash);
      if (active) {
        active.invalidated = true;
        inFlight.delete(tokenHash);
      }
    },

    invalidateUser(userId) {
      for (const [key, entry] of entries) {
        if (entry.user.id === userId) {
          entries.delete(key);
        }
      }
      for (const active of inFlight.values()) {
        active.invalidatedUserIds.add(userId);
      }
    },

    clear() {
      entries.clear();
      for (const active of inFlight.values()) {
        active.invalidated = true;
      }
      inFlight.clear();
    },
  };
}

export function verifyAdminAccessToken(
  deps: {
    gateway: { verifyAccessToken: (accessToken: string) => Promise<AdminUser | null> };
    adminAuthCache?: AdminAuthCache;
  },
  accessToken: string,
): Promise<AdminUser | null> {
  return deps.adminAuthCache
    ? deps.adminAuthCache.verify(accessToken)
    : deps.gateway.verifyAccessToken(accessToken);
}

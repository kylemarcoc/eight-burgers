import type { AdminUser } from '@menu-kiosk/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createAdminAuthCache } from './admin-auth-cache';

function buildJwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: expSeconds })).toString(
    'base64url',
  );
  return `${header}.${payload}.signature`;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const OWNER_USER: AdminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@eightburgers.local',
  role: 'owner',
};

const STAFF_USER: AdminUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'staff@eightburgers.local',
  role: 'staff',
};

describe('createAdminAuthCache', () => {
  it('caches verified active AdminUser entries within ttlMs and expires after ttlMs', async () => {
    let nowMs = 1_000_000;
    const verifier = vi.fn(async () => OWNER_USER);
    const cache = createAdminAuthCache(verifier, { ttlMs: 15_000, now: () => nowMs });

    await expect(cache.verify('opaque-token-1')).resolves.toEqual(OWNER_USER);
    nowMs += 10_000;
    await expect(cache.verify('opaque-token-1')).resolves.toEqual(OWNER_USER);
    expect(verifier).toHaveBeenCalledTimes(1);

    nowMs += 5_000;
    await expect(cache.verify('opaque-token-1')).resolves.toEqual(OWNER_USER);
    expect(verifier).toHaveBeenCalledTimes(2);
  });

  it('caps cache expiration at the JWT exp claim when shorter than ttlMs', async () => {
    let nowMs = 100_000;
    const jwt = buildJwtWithExp(105); // expires at 105_000 ms (5s ahead)
    const verifier = vi.fn(async () => OWNER_USER);
    const cache = createAdminAuthCache(verifier, { ttlMs: 15_000, now: () => nowMs });

    await expect(cache.verify(jwt)).resolves.toEqual(OWNER_USER);
    nowMs = 104_999;
    await expect(cache.verify(jwt)).resolves.toEqual(OWNER_USER);
    expect(verifier).toHaveBeenCalledTimes(1);

    nowMs = 105_000;
    await expect(cache.verify(jwt)).resolves.toEqual(OWNER_USER);
    expect(verifier).toHaveBeenCalledTimes(2);
  });

  it('never caches null results for invalid or inactive tokens', async () => {
    const verifier = vi.fn(async () => null);
    const cache = createAdminAuthCache(verifier, { ttlMs: 15_000 });

    await expect(cache.verify('bad-token')).resolves.toBeNull();
    await expect(cache.verify('bad-token')).resolves.toBeNull();
    expect(verifier).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent in-flight verifications for the same token', async () => {
    const deferred = createDeferred<AdminUser | null>();
    const verifier = vi.fn(() => deferred.promise);
    const cache = createAdminAuthCache(verifier, { ttlMs: 15_000 });

    const first = cache.verify('shared-token');
    const second = cache.verify('shared-token');
    expect(verifier).toHaveBeenCalledTimes(1);

    deferred.resolve(OWNER_USER);
    await expect(Promise.all([first, second])).resolves.toEqual([OWNER_USER, OWNER_USER]);

    await expect(cache.verify('shared-token')).resolves.toEqual(OWNER_USER);
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  it('bounds cache size by evicting expired entries first and then the oldest entry', async () => {
    let nowMs = 10_000;
    const verifier = vi.fn(async (token: string): Promise<AdminUser> => ({
      ...OWNER_USER,
      email: `${token}@eightburgers.local`,
    }));
    const cache = createAdminAuthCache(verifier, {
      ttlMs: 15_000,
      maxEntries: 2,
      now: () => nowMs,
    });

    const shortJwt = buildJwtWithExp(12); // expires at 12_000 ms
    await cache.verify(shortJwt);
    await cache.verify('token-b');
    expect(verifier).toHaveBeenCalledTimes(2);

    // At 12_500, shortJwt is expired so inserting token-c evicts shortJwt instead of token-b
    nowMs = 12_500;
    await cache.verify('token-c');
    expect(verifier).toHaveBeenCalledTimes(3);

    await cache.verify('token-b');
    expect(verifier).toHaveBeenCalledTimes(3);

    // Inserting token-d while both token-c and token-b are fresh evicts oldest (token-c)
    await cache.verify('token-d');
    expect(verifier).toHaveBeenCalledTimes(4);
    await cache.verify('token-c');
    expect(verifier).toHaveBeenCalledTimes(5);
  });

  it('invalidates by token or userId immediately and blocks stale in-flight repopulation', async () => {
    const deferredToken = createDeferred<AdminUser | null>();
    const deferredUser = createDeferred<AdminUser | null>();
    let callCount = 0;

    const verifier = vi.fn(async (token: string) => {
      callCount += 1;
      if (token === 'inflight-token' && callCount === 1) return deferredToken.promise;
      if (token === 'inflight-user-token' && callCount === 3) return deferredUser.promise;
      return token === 'inflight-user-token' ? STAFF_USER : OWNER_USER;
    });
    const cache = createAdminAuthCache(verifier, { ttlMs: 15_000 });

    const inflightLogout = cache.verify('inflight-token');
    cache.invalidateToken('inflight-token');
    deferredToken.resolve(OWNER_USER);
    await expect(inflightLogout).resolves.toEqual(OWNER_USER);

    // Must re-verify instead of serving invalidated in-flight result
    await expect(cache.verify('inflight-token')).resolves.toEqual(OWNER_USER);
    expect(verifier).toHaveBeenCalledTimes(2);

    const inflightUser = cache.verify('inflight-user-token');
    cache.invalidateUser(STAFF_USER.id);
    deferredUser.resolve(STAFF_USER);
    await expect(inflightUser).resolves.toEqual(STAFF_USER);

    await expect(cache.verify('inflight-user-token')).resolves.toEqual(STAFF_USER);
    expect(verifier).toHaveBeenCalledTimes(4);
  });
});

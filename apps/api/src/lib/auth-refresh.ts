import type { AuthRefreshResult, ShopBackendGateway } from './supabase';

const inFlightRefreshes = new WeakMap<
  ShopBackendGateway,
  Map<string, Promise<AuthRefreshResult | null>>
>();

/**
 * Deduplicates concurrent refresh-token rotations for the same gateway and token.
 * Prevents parallel requests with an expired access cookie from racing on Supabase
 * refresh-token rotation and wiping each other's newly rotated cookies.
 */
export function refreshAdminSessionSingleFlight(
  gateway: Pick<ShopBackendGateway, 'refreshAdminSession'>,
  refreshToken: string,
): Promise<AuthRefreshResult | null> {
  const key = gateway as ShopBackendGateway;
  let gatewayMap = inFlightRefreshes.get(key);
  if (!gatewayMap) {
    gatewayMap = new Map<string, Promise<AuthRefreshResult | null>>();
    inFlightRefreshes.set(key, gatewayMap);
  }

  const existing = gatewayMap.get(refreshToken);
  if (existing) return existing;

  const currentMap = gatewayMap;
  const promise = Promise.resolve()
    .then(() => gateway.refreshAdminSession(refreshToken))
    .finally(() => {
      if (currentMap.get(refreshToken) === promise) {
        currentMap.delete(refreshToken);
      }
    });

  currentMap.set(refreshToken, promise);
  return promise;
}

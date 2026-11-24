import type { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api-error';

/**
 * Cancels in-flight Staff Portal queries, evicts private admin datasets,
 * and marks the cached Staff Portal session unauthenticated.
 */
export async function clearAdminSessionCache(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: ['admin'] });
  queryClient.removeQueries({ queryKey: ['admin', 'orders'] });
  queryClient.removeQueries({ queryKey: ['admin', 'team'] });
  queryClient.setQueryData(['admin', 'auth', 'session'], {
    authenticated: false,
    user: null,
  });
}

/**
 * Clears cached Staff Portal state when a request fails with HTTP 401 so stale
 * admin views cannot linger after session revocation or expiry.
 */
export function handleAdminUnauthorizedError(queryClient: QueryClient, error: unknown): boolean {
  if (!isApiError(error) || error.status !== 401) {
    return false;
  }
  void clearAdminSessionCache(queryClient);
  return true;
}

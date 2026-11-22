import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/lib/api-error';

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isApiError(error)) return false;

  switch (error.failure.kind) {
    case 'cancelled':
    case 'validation':
      return false;
    case 'network':
    case 'timeout':
      return true;
    case 'http':
      return error.failure.status === 429 || error.failure.status >= 500;
  }
}

export function getRetryDelayMs(attemptIndex: number, error: unknown): number {
  if (isApiError(error) && error.retryAfterMs !== undefined) {
    return Math.min(30_000, error.retryAfterMs);
  }
  return Math.min(5_000, 400 * 2 ** attemptIndex);
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: shouldRetryQuery,
        retryDelay: getRetryDelayMs,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

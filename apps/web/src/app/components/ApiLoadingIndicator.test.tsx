import { QueryClient, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/shared/lib/http-client';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { ApiLoadingIndicator } from './ApiLoadingIndicator';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ApiLoadingIndicator', () => {
  it('stays hidden when idle and shows the top drop-down bar only after 150ms for foreground queries', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const deferred = createDeferred<string>();

    function ForegroundQueryHarness() {
      useQuery({
        queryKey: ['orders', 'list'],
        queryFn: () => deferred.promise,
      });
      return null;
    }

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <ForegroundQueryHarness />
      </TestQueryWrapper>,
    );

    expect(screen.queryByRole('progressbar', { name: /loading server data/i })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole('progressbar', { name: /loading server data/i })).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(screen.getByRole('progressbar', { name: /loading server data/i })).toBeTruthy();

    await act(async () => {
      deferred.resolve('ok');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar', { name: /loading server data/i })).toBeNull();
  });

  it('tracks direct apiRequest calls with trackForeground: true', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const deferredResponse = createDeferred<Response>();
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(deferredResponse.promise);

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
      </TestQueryWrapper>,
    );

    const requestPromise = apiRequest('/location/search?q=makati', { trackForeground: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(screen.getByRole('progressbar', { name: /loading server data/i })).toBeTruthy();

    await act(async () => {
      deferredResponse.resolve(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await requestPromise;
    });
    expect(screen.queryByRole('progressbar', { name: /loading server data/i })).toBeNull();
  });

  it('suppresses 15s polling ticks and cached catalog refetches while still showing fetchMore pagination', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const pollDeferred = createDeferred<string>();
    const catalogDeferred = createDeferred<string>();
    const page2Deferred = createDeferred<{ items: string[]; next: number | null }>();

    let pollCall = 0;
    let catalogCall = 0;

    function PollingHarness() {
      const pollingQuery = useQuery({
        queryKey: ['orders', 'tracker', '#8B-101'],
        meta: { isPolling: true },
        queryFn: () => {
          pollCall += 1;
          return pollCall === 1 ? Promise.resolve('received') : pollDeferred.promise;
        },
      });

      const catalogQuery = useQuery({
        queryKey: ['catalog'],
        queryFn: () => {
          catalogCall += 1;
          return catalogCall === 1 ? Promise.resolve('v1') : catalogDeferred.promise;
        },
      });

      const infiniteOrders = useInfiniteQuery({
        queryKey: ['admin', 'orders', 'infinite'],
        meta: { isPolling: true },
        initialPageParam: 1,
        getNextPageParam: (lastPage: { items: string[]; next: number | null }) =>
          lastPage.next ?? undefined,
        queryFn: ({ pageParam }) => {
          if (pageParam === 1) {
            return Promise.resolve({ items: ['a'], next: 2 });
          }
          return page2Deferred.promise;
        },
      });

      return (
        <div>
          <button type="button" onClick={() => void pollingQuery.refetch()}>
            Trigger Poll
          </button>
          <button type="button" onClick={() => void catalogQuery.refetch()}>
            Trigger Catalog Refetch
          </button>
          <button type="button" onClick={() => void infiniteOrders.fetchNextPage()}>
            Load More Orders
          </button>
        </div>
      );
    }

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <PollingHarness />
      </TestQueryWrapper>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Poll' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Catalog Refetch' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('progressbar', { name: /loading server data/i })).toBeNull();

    // Pagination fetchMore SHOULD trigger the top drop-down bar
    fireEvent.click(screen.getByRole('button', { name: 'Load More Orders' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByRole('progressbar', { name: /loading server data/i })).toBeTruthy();

    await act(async () => {
      pollDeferred.resolve('preparing');
      catalogDeferred.resolve('v2');
      page2Deferred.resolve({ items: ['b'], next: null });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar', { name: /loading server data/i })).toBeNull();
  });

  it('shows the blocking backdrop with loadingLabel during critical mutations and clears on settle', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const criticalDeferred = createDeferred<string>();
    const routineDeferred = createDeferred<string>();

    function MutationHarness() {
      const criticalMutation = useMutation({
        mutationFn: () => criticalDeferred.promise,
        meta: {
          blockingBackdrop: true,
          loadingLabel: 'Submitting your order…',
        },
      });
      const routineMutation = useMutation({
        mutationFn: () => routineDeferred.promise,
      });

      return (
        <div>
          <button type="button" onClick={() => criticalMutation.mutate()}>
            Critical Submit
          </button>
          <button type="button" onClick={() => routineMutation.mutate()}>
            Routine Toggle
          </button>
        </div>
      );
    }

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <MutationHarness />
      </TestQueryWrapper>,
    );

    // Routine mutation uses top bar (after 150ms) and never mounts the blocking backdrop
    fireEvent.click(screen.getByRole('button', { name: 'Routine Toggle' }));
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(screen.getByRole('progressbar', { name: /loading server data/i })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      routineDeferred.resolve('ok');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();

    // Critical mutation mounts blocking backdrop immediately (before the 150ms top-bar delay)
    fireEvent.click(screen.getByRole('button', { name: 'Critical Submit' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const backdropStatus = screen.getByRole('status');
    expect(backdropStatus.getAttribute('aria-busy')).toBe('true');
    expect(backdropStatus.textContent).toContain('Submitting your order…');
    expect(screen.queryByRole('progressbar')).toBeNull();

    await act(async () => {
      criticalDeferred.resolve('done');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

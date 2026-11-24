import { QueryClient, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/shared/lib/http-client';
import { acquireOverlayLock, resetOverlayLocks } from '@/shared/lib/overlay-lock';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { ApiLoadingIndicator } from './ApiLoadingIndicator';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
  resetOverlayLocks();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ApiLoadingIndicator', () => {
  it('stays hidden when idle and shows the non-blocking top bar only after 150ms for foreground initial queries without locking focus or scroll', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();

    function ForegroundQueryHarness() {
      const [page, setPage] = useState(1);
      useQuery({
        queryKey: ['orders', 'list', page],
        queryFn: () => (page === 1 ? firstDeferred.promise : secondDeferred.promise),
        meta: { loadingLabel: 'Loading customer orders…' },
      });
      return (
        <button type="button" onClick={() => setPage(2)}>
          Next Page
        </button>
      );
    }

    const { container } = render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <ForegroundQueryHarness />
      </TestQueryWrapper>,
    );

    const button = screen.getByRole('button', { name: 'Next Page' });
    button.focus();

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    const bar = screen.getByRole('progressbar', { name: 'Loading customer orders…' });
    expect(bar.textContent).toContain('Loading customer orders…');
    expect(screen.queryByRole('status')).toBeNull();
    // Non-blocking: no inert, no scroll lock, no focus theft
    expect(container.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(button);

    await act(async () => {
      firstDeferred.resolve('ok');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();

    // Subsequent foreground fetch must wait the full 150ms delay again (no stale visible flag)
    fireEvent.click(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(screen.getByRole('progressbar', { name: 'Loading customer orders…' })).toBeTruthy();

    await act(async () => {
      secondDeferred.resolve('ok-2');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows the non-blocking top bar after 150ms for direct apiRequest calls with trackForeground: true', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const deferredResponse = createDeferred<Response>();
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(deferredResponse.promise);

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
      </TestQueryWrapper>,
    );

    const requestPromise = apiRequest('/location/reverse?lat=14.5&lng=121.0', {
      trackForeground: true,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    const bar = screen.getByRole('progressbar', { name: 'Loading…' });
    expect(bar.textContent).toContain('Loading…');
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      deferredResponse.resolve(
        new Response(JSON.stringify({ data: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await requestPromise;
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('suppresses background refetches, polling, errored-query refetches, background badge queries, and typing search while showing fetchMore pagination even during search', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const pollDeferred = createDeferred<string>();
    const catalogDeferred = createDeferred<string>();
    const erroredRefetchDeferred = createDeferred<string>();
    const badgeDeferred = createDeferred<string>();
    const searchDeferred = createDeferred<string>();
    const searchPage2Deferred = createDeferred<{ items: string[]; next: number | null }>();

    let pollCall = 0;
    let catalogCall = 0;
    let erroredCall = 0;

    function QuerySuppressionHarness() {
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

      const erroredQuery = useQuery({
        queryKey: ['orders', 'tracker', '#8B-404'],
        meta: { loadingLabel: 'Looking up order…' },
        queryFn: () => {
          erroredCall += 1;
          return erroredCall === 1
            ? Promise.reject(new Error('404 Not Found'))
            : erroredRefetchDeferred.promise;
        },
      });

      // Passive background badge hydration (e.g., FloatingCartButton when drawer is closed)
      useQuery({
        queryKey: ['orders', 'receipt', 'bg-1'],
        meta: { isPolling: true, suppressLoadingIndicator: true },
        queryFn: () => badgeDeferred.promise,
      });

      // Initial typing search query suppresses initial bar
      useQuery({
        queryKey: ['admin', 'orders', 'search', 'marco'],
        meta: { suppressInitialLoadingIndicator: true },
        queryFn: () => searchDeferred.promise,
      });

      // Infinite search query: initial typing suppressed, but explicit fetchMore STILL shows bar
      const infiniteSearchedOrders = useInfiniteQuery({
        queryKey: ['admin', 'orders', 'infinite', { q: 'burger' }],
        meta: {
          isPolling: true,
          suppressInitialLoadingIndicator: true,
          loadingLabel: 'Loading customer orders…',
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage: { items: string[]; next: number | null }) =>
          lastPage.next ?? undefined,
        queryFn: ({ pageParam }) => {
          if (pageParam === 1) {
            return Promise.resolve({ items: ['a'], next: 2 });
          }
          return searchPage2Deferred.promise;
        },
      });

      return (
        <div>
          <span data-testid="errored-status">{erroredQuery.status}</span>
          <button type="button" onClick={() => void pollingQuery.refetch()}>
            Trigger Poll
          </button>
          <button type="button" onClick={() => void catalogQuery.refetch()}>
            Trigger Catalog Refetch
          </button>
          <button type="button" onClick={() => void erroredQuery.refetch()}>
            Trigger Errored Refetch
          </button>
          <button type="button" onClick={() => void infiniteSearchedOrders.fetchNextPage()}>
            Load More Orders
          </button>
        </div>
      );
    }

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <QuerySuppressionHarness />
      </TestQueryWrapper>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByTestId('errored-status').textContent).toBe('error');

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Poll' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Catalog Refetch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Errored Refetch' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    // Explicit pagination fetchMore SHOULD show the top bar after 150ms even with active search
    fireEvent.click(screen.getByRole('button', { name: 'Load More Orders' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.getByRole('progressbar', { name: 'Loading customer orders…' })).toBeTruthy();

    await act(async () => {
      pollDeferred.resolve('preparing');
      catalogDeferred.resolve('v2');
      erroredRefetchDeferred.resolve('found');
      badgeDeferred.resolve('received');
      searchDeferred.resolve('matched');
      searchPage2Deferred.resolve({ items: ['b'], next: null });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('uses the non-blocking top bar for routine mutations, ignores cleanup mutations, and mounts the blocking backdrop immediately for critical mutations', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const criticalDeferred = createDeferred<string>();
    const routineDeferred = createDeferred<string>();
    const cleanupDeferred = createDeferred<void>();
    const onBackgroundEscape = vi.fn();

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
        meta: { loadingLabel: 'Updating order status…' },
      });
      const cleanupMutation = useMutation({
        mutationFn: () => cleanupDeferred.promise,
        meta: { suppressLoadingIndicator: true },
      });

      useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            onBackgroundEscape();
          }
        }
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
      }, []);

      return (
        <div>
          <button type="button" onClick={() => criticalMutation.mutate()}>
            Submit Order
          </button>
          <button type="button" onClick={() => routineMutation.mutate()}>
            Routine Update
          </button>
          <button type="button" onClick={() => cleanupMutation.mutate()}>
            Background Cleanup
          </button>
        </div>
      );
    }

    const { container } = render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <MutationHarness />
      </TestQueryWrapper>,
    );

    // Silent cleanup mutation never opens top bar or backdrop
    fireEvent.click(screen.getByRole('button', { name: 'Background Cleanup' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      cleanupDeferred.resolve();
      await vi.advanceTimersByTimeAsync(1);
    });

    // Routine mutation uses non-blocking top bar after 150ms (no inert / no scroll lock)
    const routineBtn = screen.getByRole('button', { name: 'Routine Update' });
    routineBtn.focus();
    fireEvent.click(routineBtn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(screen.getByRole('progressbar', { name: 'Updating order status…' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(routineBtn);

    await act(async () => {
      routineDeferred.resolve('ok');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();

    // Critical mutation mounts blocking backdrop IMMEDIATELY (before 150ms), isolates background, announces via persistent live region, and stops capture Escape
    const announcer = document.querySelector<HTMLElement>('[data-api-loading-announcer="true"]');
    expect(announcer).toBeTruthy();
    expect(announcer?.getAttribute('aria-live')).toBe('polite');
    expect(announcer?.textContent).toBe('');

    const submitBtn = screen.getByRole('button', { name: 'Submit Order' });
    submitBtn.focus();
    fireEvent.click(submitBtn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toContain('Submitting your order…');
    expect(announcer?.textContent).toBe('Submitting your order…');
    expect(announcer?.hasAttribute('inert')).toBe(false);
    expect(announcer?.getAttribute('aria-hidden')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.hasAttribute('inert')).toBe(true);
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBackgroundEscape).not.toHaveBeenCalled();

    await act(async () => {
      criticalDeferred.resolve('done');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(announcer?.textContent).toBe('');
    expect(container.hasAttribute('inert')).toBe(false);
    expect(container.getAttribute('aria-hidden')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(submitBtn);
  });

  it('preserves scroll lock and background isolation when a portaled drawer closes before a critical blocking backdrop finishes (non-LIFO)', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const criticalDeferred = createDeferred<string>();
    const onDrawerEscape = vi.fn();
    let closeDrawerExternally!: () => void;

    function MockDrawer({ open, onSubmit }: { open: boolean; onSubmit: () => void }) {
      const portalRef = useRef<HTMLDivElement | null>(null);
      useEffect(() => {
        if (!open) return;
        const lock = acquireOverlayLock(portalRef.current);
        function handleKeyDown(event: KeyboardEvent) {
          if (!lock.isTopmost()) return;
          if (event.key === 'Escape') {
            onDrawerEscape();
          }
        }
        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
          window.removeEventListener('keydown', handleKeyDown, true);
          lock.release();
        };
      }, [open]);

      if (!open) return null;
      return createPortal(
        <div ref={portalRef} data-testid="mock-drawer">
          <button type="button" onClick={onSubmit}>
            Submit Order
          </button>
        </div>,
        document.body,
      );
    }

    function OverlapHarness() {
      const [drawerOpen, setDrawerOpen] = useState(true);
      closeDrawerExternally = () => setDrawerOpen(false);
      const criticalMutation = useMutation({
        mutationFn: () => criticalDeferred.promise,
        meta: { blockingBackdrop: true, loadingLabel: 'Submitting your order…' },
      });

      return <MockDrawer open={drawerOpen} onSubmit={() => criticalMutation.mutate()} />;
    }

    const { container } = render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <OverlapHarness />
      </TestQueryWrapper>,
    );

    expect(container.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // Start critical mutation from inside the open drawer
    fireEvent.click(screen.getByRole('button', { name: 'Submit Order' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByTestId('mock-drawer').hasAttribute('inert')).toBe(true);

    // Drawer's capture-phase Escape listener ignores Escape while blocking backdrop is topmost
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDrawerEscape).not.toHaveBeenCalled();

    // Close drawer programmatically BEFORE mutation settles (non-LIFO)
    act(() => {
      closeDrawerExternally();
    });
    expect(screen.queryByTestId('mock-drawer')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(container.hasAttribute('inert')).toBe(true);
    expect(container.getAttribute('aria-hidden')).toBe('true');

    // Resolve mutation -> full clean restoration (no leaked overflow: hidden)
    await act(async () => {
      criticalDeferred.resolve('done');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(container.hasAttribute('inert')).toBe(false);
    expect(container.getAttribute('aria-hidden')).toBeNull();
  });

  it('shows the foreground top bar when a shared query has both a foreground observer and a later-rendered suppressed passive observer', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const receiptDeferred = createDeferred<string>();

    function ForegroundObserver() {
      useQuery({
        queryKey: ['orders', 'receipt', 'shared-1'],
        queryFn: () => receiptDeferred.promise,
        meta: { loadingLabel: 'Loading order receipt…' },
      });
      return null;
    }

    function PassiveBadgeObserver() {
      useQuery({
        queryKey: ['orders', 'receipt', 'shared-1'],
        queryFn: () => receiptDeferred.promise,
        meta: { suppressLoadingIndicator: true, loadingLabel: 'Loading order receipt…' },
      });
      return null;
    }

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <ForegroundObserver />
        <PassiveBadgeObserver />
      </TestQueryWrapper>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    const bar = screen.getByRole('progressbar', { name: 'Loading order receipt…' });
    expect(bar.textContent).toContain('Loading order receipt…');

    await act(async () => {
      receiptDeferred.resolve('received');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('always waits the full 150ms delay across rapid back-to-back foreground requests', async () => {
    vi.useFakeTimers();
    const client = createTestClient();
    const first = createDeferred<string>();
    const second = createDeferred<string>();

    function RapidFetchHarness() {
      const [key, setKey] = useState<number>(1);
      useQuery({
        queryKey: ['rapid', key],
        queryFn: () => (key === 1 ? first.promise : second.promise),
        meta: { loadingLabel: 'Loading rapid…' },
      });
      return (
        <button type="button" onClick={() => setKey(2)}>
          Second
        </button>
      );
    }

    render(
      <TestQueryWrapper client={client}>
        <ApiLoadingIndicator />
        <RapidFetchHarness />
      </TestQueryWrapper>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(160);
    });
    expect(screen.getByRole('progressbar', { name: 'Loading rapid…' })).toBeTruthy();

    await act(async () => {
      first.resolve('done-1');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(screen.getByRole('progressbar', { name: 'Loading rapid…' })).toBeTruthy();

    await act(async () => {
      second.resolve('done-2');
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

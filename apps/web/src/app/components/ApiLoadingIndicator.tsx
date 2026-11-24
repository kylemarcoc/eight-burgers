import { notifyManager, type Query, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useForegroundRequestCount } from '@/shared/lib/api-activity';
import { acquireOverlayLock } from '@/shared/lib/overlay-lock';

const TOP_BAR_SHOW_DELAY_MS = 150;
const BLOCKING_BACKDROP_PRIORITY = 100;

function readCustomLoadingLabel(meta: Record<string, unknown> | undefined): string | null {
  return typeof meta?.loadingLabel === 'string' && meta.loadingLabel.trim()
    ? meta.loadingLabel
    : null;
}

function resolveLoadingLabel(meta: Record<string, unknown> | undefined, fallback: string): string {
  return readCustomLoadingLabel(meta) ?? fallback;
}

function getActiveObserverMetas(query: Query): Array<Record<string, unknown> | undefined> {
  if (query.observers.length === 0) {
    return [query.meta];
  }

  const enabledMetas: Array<Record<string, unknown> | undefined> = [];
  for (const observer of query.observers) {
    const enabledOption = observer.options.enabled;
    const isEnabled =
      typeof enabledOption === 'function' ? Boolean(enabledOption(query)) : enabledOption !== false;
    if (isEnabled) {
      enabledMetas.push(observer.options.meta);
    }
  }

  return enabledMetas.length > 0 ? enabledMetas : [query.meta];
}

function getQueryLoadingLabel(query: Query): string | null {
  const metas = getActiveObserverMetas(query);
  for (let index = metas.length - 1; index >= 0; index -= 1) {
    const meta = metas[index];
    if (meta?.suppressLoadingIndicator === true) {
      continue;
    }
    const label = readCustomLoadingLabel(meta);
    if (label) {
      return label;
    }
  }
  return readCustomLoadingLabel(query.meta);
}

function isForegroundQueryFetch(query: Query): boolean {
  const metas = getActiveObserverMetas(query);
  if (metas.every((meta) => meta?.suppressLoadingIndicator === true)) {
    return false;
  }
  if (query.state.fetchMeta?.fetchMore) {
    return true;
  }
  if (metas.every((meta) => meta?.suppressInitialLoadingIndicator === true)) {
    return false;
  }
  // Only show the global top bar for genuine initial loads (`pending` with no prior
  // settled error). Background refetches of loaded data (`success`) and refetches of
  // previously errored queries (`errorUpdateCount > 0`, which TanStack Query v5 flips
  // back to `pending` when `data` is undefined) are handled silently or by inline UI.
  return query.state.status === 'pending' && query.state.errorUpdateCount === 0;
}

export function ApiLoadingIndicator() {
  const queryClient = useQueryClient();
  const blockingPortalRef = useRef<HTMLDivElement | null>(null);
  const statusCardRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const subscribeToQueryCache = useCallback(
    (onStoreChange: () => void) => {
      const notify = notifyManager.batchCalls(onStoreChange);
      return queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === 'updated' ||
          event.type === 'removed' ||
          (event.type === 'added' && event.query.state.fetchStatus === 'fetching') ||
          ((event.type === 'observerAdded' ||
            event.type === 'observerRemoved' ||
            event.type === 'observerOptionsUpdated') &&
            event.query.state.fetchStatus === 'fetching')
        ) {
          notify();
        }
      });
    },
    [queryClient],
  );

  const getForegroundFetchLabel = useCallback((): string | null => {
    const activeQueries = queryClient.getQueryCache().findAll({
      fetchStatus: 'fetching',
      predicate: isForegroundQueryFetch,
    });
    if (activeQueries.length === 0) {
      return null;
    }
    for (let index = activeQueries.length - 1; index >= 0; index -= 1) {
      const query = activeQueries[index];
      const label = query ? getQueryLoadingLabel(query) : null;
      if (label) {
        return label;
      }
    }
    return 'Loading…';
  }, [queryClient]);

  const activeFetchLabel = useSyncExternalStore(
    subscribeToQueryCache,
    getForegroundFetchLabel,
    getForegroundFetchLabel,
  );

  const directForegroundCount = useForegroundRequestCount();

  const blockingMutations = useMutationState({
    filters: {
      status: 'pending',
      predicate: (mutation) =>
        mutation.meta?.blockingBackdrop === true &&
        mutation.meta?.suppressLoadingIndicator !== true,
    },
    select: (mutation) => ({
      id: mutation.mutationId,
      label: resolveLoadingLabel(mutation.meta, 'Processing request…'),
    }),
  });

  const routineMutations = useMutationState({
    filters: {
      status: 'pending',
      predicate: (mutation) =>
        mutation.meta?.blockingBackdrop !== true &&
        mutation.meta?.suppressLoadingIndicator !== true,
    },
    select: (mutation) => ({
      id: mutation.mutationId,
      label: resolveLoadingLabel(mutation.meta, 'Saving changes…'),
    }),
  });

  const activeBlockingMutation = blockingMutations[blockingMutations.length - 1] ?? null;
  const activeRoutineMutation = routineMutations[routineMutations.length - 1] ?? null;
  const isBlockingBackdropVisible = activeBlockingMutation !== null;

  const topBarLabel = !isBlockingBackdropVisible
    ? (activeRoutineMutation?.label ??
      activeFetchLabel ??
      (directForegroundCount > 0 ? 'Loading…' : null))
    : null;
  const hasTopBarActivity = topBarLabel !== null;

  const [delayedTopBarVisible, setDelayedTopBarVisible] = useState(false);

  if (!hasTopBarActivity && delayedTopBarVisible) {
    setDelayedTopBarVisible(false);
  }

  useEffect(() => {
    if (!hasTopBarActivity) return;
    const timer = window.setTimeout(() => {
      setDelayedTopBarVisible(true);
    }, TOP_BAR_SHOW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [hasTopBarActivity]);

  const showTopBar = hasTopBarActivity && delayedTopBarVisible;

  useEffect(() => {
    if (!isBlockingBackdropVisible) return;

    const portalNode = blockingPortalRef.current;
    const activeElement =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    previousFocusRef.current =
      activeElement && (!portalNode || !portalNode.contains(activeElement)) ? activeElement : null;

    const overlayLock = acquireOverlayLock(portalNode, { priority: BLOCKING_BACKDROP_PRIORITY });
    statusCardRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (!overlayLock.isTopmost()) {
        return;
      }
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === 'Tab') {
          statusCardRef.current?.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      overlayLock.release();

      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus && previousFocus.isConnected && !previousFocus.closest('[inert]')) {
        previousFocus.focus();
      }
    };
  }, [isBlockingBackdropVisible]);

  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(
    <>
      <div
        data-overlay-exempt="true"
        data-api-loading-announcer="true"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {activeBlockingMutation?.label ?? ''}
      </div>

      {showTopBar && topBarLabel ? (
        <div
          data-overlay-exempt="true"
          role="progressbar"
          aria-label={topBarLabel}
          className="pointer-events-none fixed inset-x-0 top-0 z-[55] flex flex-col items-center"
        >
          <div className="h-0.5 w-full bg-ui-accent" />
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-ui-border bg-ui-surface/95 px-3.5 py-1.5 text-xs font-medium text-ui-text shadow-md backdrop-blur-xs motion-reduce:transition-none">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ui-border border-t-ui-accent motion-reduce:animate-none"
            />
            <span>{topBarLabel}</span>
          </div>
        </div>
      ) : null}

      {activeBlockingMutation ? (
        <div
          ref={blockingPortalRef}
          data-api-loading-backdrop="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-xs"
        >
          <div
            ref={statusCardRef}
            role="status"
            aria-busy="true"
            tabIndex={-1}
            className="flex items-center gap-3 rounded-2xl border border-ui-border bg-ui-surface px-5 py-4 text-sm font-semibold text-ui-text shadow-xl focus:outline-none"
          >
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ui-border border-t-ui-accent motion-reduce:animate-none"
            />
            <span>{activeBlockingMutation.label}</span>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}

import { useIsFetching, useIsMutating, useMutationState } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForegroundRequestCount } from '@/shared/lib/api-activity';

const TOP_BAR_SHOW_DELAY_MS = 150;

export function ApiLoadingIndicator() {
  const foregroundFetchCount = useIsFetching({
    predicate: (query) => {
      if (
        query.meta?.isPolling === true &&
        query.state.status !== 'pending' &&
        !query.state.fetchMeta?.fetchMore
      ) {
        return false;
      }
      if (query.queryKey[0] === 'catalog' && query.state.status === 'success') {
        return false;
      }
      return true;
    },
  });

  const foregroundMutationCount = useIsMutating({
    predicate: (mutation) => mutation.meta?.blockingBackdrop !== true,
  });

  const directForegroundCount = useForegroundRequestCount();

  const blockingMutations = useMutationState({
    filters: {
      status: 'pending',
      predicate: (mutation) => mutation.meta?.blockingBackdrop === true,
    },
    select: (mutation) => ({
      id: mutation.mutationId,
      label:
        typeof mutation.meta?.loadingLabel === 'string' && mutation.meta.loadingLabel.trim()
          ? mutation.meta.loadingLabel
          : 'Processing request…',
    }),
  });

  const activeBlockingMutation = blockingMutations[blockingMutations.length - 1] ?? null;
  const hasBlockingBackdrop = activeBlockingMutation !== null;
  const hasForegroundActivity =
    !hasBlockingBackdrop &&
    foregroundFetchCount + foregroundMutationCount + directForegroundCount > 0;

  const [delayedVisible, setDelayedVisible] = useState(false);

  useEffect(() => {
    if (!hasForegroundActivity) return;
    const timer = window.setTimeout(() => {
      setDelayedVisible(true);
    }, TOP_BAR_SHOW_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      setDelayedVisible(false);
    };
  }, [hasForegroundActivity]);

  const showTopBar = hasForegroundActivity && delayedVisible;

  if (!showTopBar && !activeBlockingMutation) {
    return null;
  }

  return createPortal(
    <div data-api-loading-portal="true">
      {showTopBar ? (
        <div
          role="progressbar"
          aria-label="Loading server data"
          className="pointer-events-none fixed inset-x-0 top-0 z-[55] flex flex-col items-center"
        >
          <div className="h-0.5 w-full bg-ui-accent" />
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-ui-border bg-ui-surface/95 px-3.5 py-1.5 text-xs font-medium text-ui-text shadow-md backdrop-blur-xs motion-reduce:transition-none">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-ui-border border-t-ui-accent motion-reduce:animate-none"
            />
            <span>Loading…</span>
          </div>
        </div>
      ) : null}

      {activeBlockingMutation ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-xs">
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="flex items-center gap-3 rounded-2xl border border-ui-border bg-ui-surface px-5 py-4 text-sm font-semibold text-ui-text shadow-xl"
          >
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ui-border border-t-ui-accent motion-reduce:animate-none"
            />
            <span>{activeBlockingMutation.label}</span>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

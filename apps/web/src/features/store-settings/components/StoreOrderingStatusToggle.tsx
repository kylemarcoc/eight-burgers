import { useId, useState, type SubmitEvent } from 'react';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { useStoreProfile, useUpdateStoreOrderingStatusMutation } from '../hooks/useStoreSettings';

export type StoreOrderingStatusToggleProps = {
  compact?: boolean;
  onStatusMessage?: (message: string, tone?: 'success' | 'error') => void;
};

export function StoreOrderingStatusToggle({
  compact = false,
  onStatusMessage,
}: StoreOrderingStatusToggleProps) {
  const { store, catalogQuery } = useStoreProfile();
  const updateStatusMutation = useUpdateStoreOrderingStatusMutation();

  const [closedNotice, setClosedNotice] = useState(store.closedNotice);
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>(store.version);
  const [isDirty, setIsDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const [lastSyncedKey, setLastSyncedKey] = useState(
    `${store.acceptingOrders}|${store.closedNotice}|${store.version ?? ''}`,
  );

  const noticeInputId = useId();
  const currentKey = `${store.acceptingOrders}|${store.closedNotice}|${store.version ?? ''}`;

  if (currentKey !== lastSyncedKey) {
    setLastSyncedKey(currentKey);
    if (!isDirty) {
      setClosedNotice(store.closedNotice);
      setLoadedVersion(store.version);
      setConflict(false);
    }
  }

  function reportStatus(message: string, tone: 'success' | 'error' = 'success') {
    if (onStatusMessage) {
      onStatusMessage(message, tone);
    } else {
      setLocalFeedback({ tone, message });
    }
  }

  async function reloadLatest() {
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.store ?? store;
    setClosedNotice(latest.closedNotice);
    setLoadedVersion(latest.version);
    setLastSyncedKey(`${latest.acceptingOrders}|${latest.closedNotice}|${latest.version ?? ''}`);
    setIsDirty(false);
    setConflict(false);
    reportStatus('Reloaded latest ordering status.');
  }

  async function persistStatus(nextAccepting: boolean, nextNotice: string) {
    try {
      const updated = await updateStatusMutation.mutateAsync({
        acceptingOrders: nextAccepting,
        closedNotice: nextNotice.trim(),
        expectedVersion: loadedVersion ?? store.version,
      });
      setClosedNotice(updated.closedNotice);
      setLoadedVersion(updated.version);
      setLastSyncedKey(
        `${updated.acceptingOrders}|${updated.closedNotice}|${updated.version ?? ''}`,
      );
      setIsDirty(false);
      setConflict(false);
      reportStatus(
        updated.acceptingOrders
          ? 'Store is now accepting customer orders.'
          : 'Incoming customer orders paused. Customers can still browse and build a bag.',
      );
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setConflict(true);
      }
      reportStatus(getApiErrorMessage(error, 'Failed to update ordering status.'), 'error');
    }
  }

  function handleNoticeSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistStatus(store.acceptingOrders, closedNotice);
  }

  return (
    <section
      aria-label="Store ordering status"
      className={`rounded-2xl border bg-ui-surface ${
        store.acceptingOrders ? 'border-ui-border' : 'border-ui-error/40'
      } ${compact ? 'p-4' : 'p-5'}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-ui-text">Accepting orders</h2>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                store.acceptingOrders
                  ? 'bg-ui-surface-muted text-ui-accent'
                  : 'border border-ui-error/40 bg-ui-error/10 text-ui-error'
              }`}
            >
              {store.acceptingOrders ? 'Open' : 'Paused'}
            </span>
          </div>
          <p className="text-xs text-ui-text-muted">
            {store.acceptingOrders
              ? 'Customers can place new orders from the storefront.'
              : 'Checkout is paused. Customers can browse and build their bag, but Place Order is disabled.'}
          </p>
        </div>

        <button
          type="button"
          disabled={updateStatusMutation.isPending}
          aria-pressed={!store.acceptingOrders}
          onClick={() => void persistStatus(!store.acceptingOrders, closedNotice)}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none disabled:opacity-60 ${
            store.acceptingOrders
              ? 'border border-ui-error/40 bg-ui-error/10 text-ui-error hover:bg-ui-error/20'
              : 'bg-ui-accent text-ui-on-accent hover:bg-ui-accent-hover'
          }`}
        >
          {updateStatusMutation.isPending
            ? 'Updating…'
            : store.acceptingOrders
              ? 'Pause orders'
              : 'Resume orders'}
        </button>
      </div>

      {conflict ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
        >
          <span>Store status changed on another device. Reload before trying again.</span>
          <button
            type="button"
            onClick={() => void reloadLatest()}
            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Reload latest
          </button>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={handleNoticeSubmit}
        className="mt-3 flex flex-col gap-2 border-t border-ui-border pt-3 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={noticeInputId} className="block text-xs font-semibold text-ui-text">
            Paused notice (optional)
          </label>
          <input
            id={noticeInputId}
            type="text"
            maxLength={200}
            value={closedNotice}
            onChange={(event) => {
              setClosedNotice(event.target.value);
              setIsDirty(true);
            }}
            placeholder="e.g. Kitchen is catching up on orders — back in 20 minutes."
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text placeholder:text-ui-text-muted"
          />
        </div>
        <button
          type="submit"
          disabled={updateStatusMutation.isPending || !isDirty}
          className="shrink-0 rounded-xl border border-ui-border bg-ui-surface-muted px-3.5 py-2 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
        >
          Save notice
        </button>
      </form>

      {localFeedback ? (
        <p
          role={localFeedback.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`mt-2 text-xs font-medium ${
            localFeedback.tone === 'error' ? 'text-ui-error' : 'text-ui-accent'
          }`}
        >
          {localFeedback.message}
        </p>
      ) : null}
    </section>
  );
}

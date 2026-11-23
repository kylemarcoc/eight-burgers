import { Suspense, lazy, useCallback, useState } from 'react';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useStoreProfile } from '../hooks/useStoreSettings';
import { StoreBrandingThemeForm } from './StoreBrandingThemeForm';
import { StoreFulfillmentPaymentForm } from './StoreFulfillmentPaymentForm';
import { StoreOrderingStatusToggle } from './StoreOrderingStatusToggle';
import { StoreOriginPinForm } from './StoreOriginPinForm';
import { StoreProfileForm } from './StoreProfileForm';

const TableQrGenerator = lazy(() =>
  import('./TableQrGenerator').then((mod) => ({ default: mod.TableQrGenerator })),
);

type StatusBanner = {
  tone: 'success' | 'error';
  message: string;
};

export function StoreSettingsManager() {
  const { catalogQuery } = useStoreProfile();
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);

  const handleStatusMessage = useCallback(
    (message: string, tone: 'success' | 'error' = 'success') => {
      setStatusBanner({ tone, message });
    },
    [],
  );

  return (
    <div className="space-y-8 pb-24">
      <section className="border-b border-ui-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ui-text">Store Settings</h1>
        <p className="mt-1 text-sm text-ui-text-muted">
          Manage store identity, storefront branding, accent theme, shop location pin, and live
          order acceptance. Changes take effect immediately for customers.
        </p>
      </section>

      {statusBanner ? (
        statusBanner.tone === 'error' ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-xl border border-ui-error/40 bg-ui-surface px-4 py-3 text-sm font-medium text-ui-error"
          >
            <span>{statusBanner.message}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs text-ui-text-muted underline hover:text-ui-text"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center justify-between gap-4 rounded-xl border border-ui-accent/40 bg-ui-surface px-4 py-3 text-sm font-medium text-ui-text"
          >
            <span>{statusBanner.message}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs text-ui-text-muted underline hover:text-ui-text"
            >
              Dismiss
            </button>
          </div>
        )
      ) : null}

      {catalogQuery.isPending ? (
        <div
          role="status"
          className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-sm text-ui-text-muted"
        >
          Loading store settings…
        </div>
      ) : catalogQuery.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-ui-error/40 bg-ui-surface p-6 text-sm text-ui-error sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{getApiErrorMessage(catalogQuery.error, 'Unable to load store settings.')}</span>
          <button
            type="button"
            onClick={() => void catalogQuery.refetch()}
            className="rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <StoreOrderingStatusToggle onStatusMessage={handleStatusMessage} />
          <StoreProfileForm onStatusMessage={handleStatusMessage} />
          <StoreBrandingThemeForm onStatusMessage={handleStatusMessage} />
          <StoreOriginPinForm onStatusMessage={handleStatusMessage} />
          <StoreFulfillmentPaymentForm onStatusMessage={handleStatusMessage} />
          <Suspense
            fallback={
              <div
                role="status"
                className="rounded-2xl border border-ui-border bg-ui-surface p-5 text-xs text-ui-text-muted"
              >
                Loading table QR generator…
              </div>
            }
          >
            <TableQrGenerator />
          </Suspense>
        </div>
      )}
    </div>
  );
}

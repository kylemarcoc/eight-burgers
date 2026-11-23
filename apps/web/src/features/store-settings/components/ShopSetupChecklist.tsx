import {
  DEFAULT_STORE_PROFILE,
  PAYMENT_METHOD_VALUES,
  isValidCoordinates,
} from '@menu-kiosk/contracts';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStoreProfile } from '../hooks/useStoreSettings';

export const SETUP_CHECKLIST_DISMISSED_KEY = 'menu-kiosk:setup-checklist-dismissed';

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SETUP_CHECKLIST_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function ShopSetupChecklist() {
  const { catalogQuery } = useStoreProfile();
  const [dismissed, setDismissed] = useState(readDismissed);
  const headingId = useId();

  if (dismissed || !catalogQuery.isSuccess || !catalogQuery.data) {
    return null;
  }

  const store = catalogQuery.data.store ?? DEFAULT_STORE_PROFILE;
  const categories = catalogQuery.data.categories ?? [];
  const menu = catalogQuery.data.menu ?? [];

  const hasCustomProfile =
    Boolean(store.storeName.trim()) &&
    store.storeName.trim() !== 'Your Shop' &&
    Boolean(store.address.trim());
  const hasOriginPin = isValidCoordinates(store.originCoords);
  const hasMenuCatalog = categories.length > 0 && menu.length > 0;

  const needsSetup = !hasCustomProfile || !hasOriginPin || !hasMenuCatalog;
  if (!needsSetup) {
    return null;
  }

  const enabledFulfillmentCount = [
    store.pickupEnabled,
    store.deliveryEnabled,
    store.dineInEnabled,
  ].filter(Boolean).length;
  const enabledPaymentCount = PAYMENT_METHOD_VALUES.filter(
    (method) => store.paymentMethods[method].enabled,
  ).length;
  const hasPaymentQrOrDigital = PAYMENT_METHOD_VALUES.some(
    (method) => method !== 'cash' && store.paymentMethods[method].enabled,
  );

  const steps: ReadonlyArray<{
    id: string;
    title: string;
    description: string;
    done: boolean;
    optional?: boolean;
    to: string;
    actionLabel: string;
  }> = [
    {
      id: 'profile-pin',
      title: 'Store profile & location pin',
      description:
        hasCustomProfile && hasOriginPin
          ? `${store.storeName} profile and shop pin are configured.`
          : !hasCustomProfile && !hasOriginPin
            ? 'Set your shop name, address, and location pin to enable distance delivery.'
            : !hasCustomProfile
              ? 'Update the default shop name and address shown on the storefront.'
              : 'Set your shop location pin in Store Settings to enable distance delivery.',
      done: hasCustomProfile && hasOriginPin,
      to: '/admin/settings',
      actionLabel: 'Open Store Settings',
    },
    {
      id: 'categories-menu',
      title: 'Categories & menu items',
      description: hasMenuCatalog
        ? `${categories.length} ${categories.length === 1 ? 'category' : 'categories'} and ${menu.length} ${menu.length === 1 ? 'item' : 'items'} published.`
        : categories.length === 0
          ? 'Create at least one menu category, then add your first menu items below.'
          : 'Add your first menu items so customers can browse and place orders.',
      done: hasMenuCatalog,
      to: '/admin',
      actionLabel: 'Manage Menu',
    },
    {
      id: 'fulfillment-payment',
      title: 'Fulfillment & payment QR',
      description: `${enabledFulfillmentCount} fulfillment ${enabledFulfillmentCount === 1 ? 'mode' : 'modes'} and ${enabledPaymentCount} payment ${enabledPaymentCount === 1 ? 'method' : 'methods'} active.`,
      done: hasPaymentQrOrDigital || store.dineInEnabled || store.deliveryEnabled,
      optional: true,
      to: '/admin/settings',
      actionLabel: 'Configure Payments & QR',
    },
    {
      id: 'team',
      title: 'Team accounts',
      description: 'Add Cashier or Staff accounts for order verification and daily stock toggles.',
      done: false,
      optional: true,
      to: '/admin/team',
      actionLabel: 'Manage Team',
    },
  ];

  const requiredDoneCount = [hasCustomProfile && hasOriginPin, hasMenuCatalog].filter(
    Boolean,
  ).length;

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(SETUP_CHECKLIST_DISMISSED_KEY, '1');
    } catch {
      // Ignore storage errors and keep checklist dismissed in memory.
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-2xl border border-ui-accent/40 bg-ui-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ui-border pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="text-lg font-bold text-ui-text">
              Finish setting up your shop
            </h2>
            <span className="rounded-md bg-ui-surface-muted px-2 py-0.5 text-xs font-semibold text-ui-accent tabular-nums">
              {requiredDoneCount} of 2 core steps done
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ui-text-muted">
            Complete the essentials below before sharing your storefront link or table QR stickers.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
        >
          Dismiss
        </button>
      </div>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex flex-col justify-between gap-3 rounded-xl border border-ui-border bg-ui-canvas p-3.5"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ui-text">{step.title}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    step.done
                      ? 'bg-ui-surface-muted text-ui-accent'
                      : step.optional
                        ? 'bg-ui-surface text-ui-text-muted'
                        : 'border border-ui-accent/40 bg-ui-surface text-ui-text'
                  }`}
                >
                  {step.done ? 'Done' : step.optional ? 'Optional' : 'To do'}
                </span>
              </div>
              <p className="text-xs text-ui-text-muted">{step.description}</p>
            </div>

            <div>
              <Link
                to={step.to}
                className="inline-flex items-center rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
              >
                {step.actionLabel}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

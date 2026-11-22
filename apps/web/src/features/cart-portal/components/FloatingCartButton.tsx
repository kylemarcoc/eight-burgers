import { useOrderReceiptQuery, usePublicOrderTrackerQuery } from '@/features/orders';
import { formatPhp } from '@/shared/shop/shop-storage';
import type { OrderStatus } from '@/shared/shop/types';
import {
  useCartActions,
  useCartOpen,
  useLastPlacedOrder,
  useTrackedQueueNumber,
} from '@/shared/store/useCartStore';
import { useResolvedCartSummary } from '../hooks/useResolvedCartSummary';

const TRACKER_STAGE_LABELS: Record<OrderStatus, string> = {
  received: 'Order Received',
  grilling: 'On the Grill',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function FloatingCartButton() {
  const cartSummary = useResolvedCartSummary();
  const isCartOpen = useCartOpen();
  const lastPlacedOrderState = useLastPlacedOrder();
  const trackedQueueNumber = useTrackedQueueNumber();
  const { setCartOpen } = useCartActions();

  const activeQueueNumber = trackedQueueNumber ?? lastPlacedOrderState?.order.queueNumber ?? null;
  const hasMatchingInMemoryReceipt = Boolean(
    lastPlacedOrderState &&
    (!activeQueueNumber ||
      lastPlacedOrderState.order.queueNumber.toUpperCase() === activeQueueNumber.toUpperCase()),
  );

  const receiptQuery = useOrderReceiptQuery(
    hasMatchingInMemoryReceipt ? (lastPlacedOrderState?.order.id ?? null) : null,
    hasMatchingInMemoryReceipt ? (lastPlacedOrderState?.receiptToken ?? null) : null,
    hasMatchingInMemoryReceipt,
  );
  const publicTrackerQuery = usePublicOrderTrackerQuery(
    activeQueueNumber,
    Boolean(activeQueueNumber && !hasMatchingInMemoryReceipt),
  );

  const trackedStatus: OrderStatus | null = hasMatchingInMemoryReceipt
    ? (receiptQuery.data?.status ?? lastPlacedOrderState?.order.status ?? null)
    : (publicTrackerQuery.data?.status ?? null);
  const trackedStageLabel = trackedStatus
    ? TRACKER_STAGE_LABELS[trackedStatus]
    : 'Track live status';

  const label =
    cartSummary.totalItems > 0
      ? `Open cart with ${cartSummary.totalItems} ${
          cartSummary.totalItems === 1 ? 'item' : 'items'
        }, subtotal ${formatPhp(cartSummary.subtotalPhp)}${
          activeQueueNumber ? ` (Tracking ${activeQueueNumber})` : ''
        }`
      : activeQueueNumber
        ? `Open order tracker for ${activeQueueNumber} (${trackedStageLabel})`
        : 'Open cart (empty)';

  return (
    <button
      type="button"
      onClick={() => setCartOpen(!isCartOpen)}
      aria-label={label}
      aria-expanded={isCartOpen}
      className="fixed right-5 bottom-5 z-40 inline-flex items-center gap-3 rounded-2xl border border-ui-border bg-ui-accent px-4 py-3 text-ui-on-accent shadow-lg hover:bg-ui-accent-hover motion-safe:transition-transform motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] sm:right-7 sm:bottom-7"
    >
      <span className="relative inline-flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-5 w-5"
        >
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        {cartSummary.totalItems > 0 ? (
          <span className="absolute -top-2 -right-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-950 px-1 text-[11px] font-bold text-amber-200 tabular-nums">
            {cartSummary.totalItems}
          </span>
        ) : null}
      </span>

      <span className="flex flex-col text-left leading-tight">
        <span className="text-xs font-medium opacity-90">
          {cartSummary.totalItems > 0
            ? `${cartSummary.totalItems} ${cartSummary.totalItems === 1 ? 'item' : 'items'}${
                activeQueueNumber ? ` · ${activeQueueNumber}` : ''
              }`
            : activeQueueNumber
              ? `Order ${activeQueueNumber}`
              : 'Cart'}
        </span>
        <span className="text-sm font-bold tabular-nums">
          {cartSummary.totalItems > 0
            ? formatPhp(cartSummary.subtotalPhp)
            : activeQueueNumber
              ? trackedStageLabel
              : 'View bag'}
        </span>
      </span>
    </button>
  );
}

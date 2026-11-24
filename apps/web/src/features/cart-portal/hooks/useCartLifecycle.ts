import { DEFAULT_STORE_PROFILE, normalizeQueueNumber } from '@menu-kiosk/contracts';
import { useEffect } from 'react';
import { useCatalogQuery } from '@/features/menu-catalog';
import { useOrderReceiptQuery } from '@/features/orders';
import { isApiError } from '@/shared/lib/api-error';
import {
  useCartActions,
  useLastPlacedOrder,
  useReceiptSession,
  useTrackedQueueNumber,
} from '@/shared/store/useCartStore';
import { useResolvedCartSummary } from './useResolvedCartSummary';

export function useCartLifecycle(enabled = true) {
  const catalogQuery = useCatalogQuery();
  const cartSummary = useResolvedCartSummary();
  const lastPlacedOrderState = useLastPlacedOrder();
  const receiptSession = useReceiptSession();
  const trackedQueueNumber = useTrackedQueueNumber();
  const { removeCartLines, clearReceiptSession, clearPersistedReceiptSession } = useCartActions();

  const store = catalogQuery.data?.store ?? DEFAULT_STORE_PROFILE;
  const activeReceiptOrderId = lastPlacedOrderState?.order.id ?? receiptSession?.orderId ?? null;
  const activeReceiptToken =
    lastPlacedOrderState?.receiptToken ?? receiptSession?.receiptToken ?? null;
  const activeReceiptQueue =
    lastPlacedOrderState?.order.queueNumber ?? receiptSession?.queueNumber ?? null;

  const activeQueueNumber = trackedQueueNumber ?? activeReceiptQueue ?? null;
  const hasMatchingReceiptSession = Boolean(
    activeReceiptOrderId &&
    activeReceiptToken &&
    (!activeQueueNumber ||
      !activeReceiptQueue ||
      normalizeQueueNumber(activeReceiptQueue, store.queuePrefix) ===
        normalizeQueueNumber(activeQueueNumber, store.queuePrefix)),
  );

  const liveReceiptQuery = useOrderReceiptQuery(
    hasMatchingReceiptSession ? activeReceiptOrderId : null,
    hasMatchingReceiptSession ? activeReceiptToken : null,
    enabled && hasMatchingReceiptSession,
  );

  useEffect(() => {
    if (!enabled) return;
    const status = liveReceiptQuery.data?.status;
    if (status === 'completed' || status === 'cancelled') {
      clearPersistedReceiptSession();
    }
  }, [enabled, liveReceiptQuery.data?.status, clearPersistedReceiptSession]);

  useEffect(() => {
    if (!enabled) return;
    if (
      liveReceiptQuery.isError &&
      isApiError(liveReceiptQuery.error) &&
      liveReceiptQuery.error.status === 404 &&
      receiptSession
    ) {
      clearReceiptSession();
    }
  }, [
    enabled,
    liveReceiptQuery.isError,
    liveReceiptQuery.error,
    receiptSession,
    clearReceiptSession,
  ]);

  useEffect(() => {
    if (!enabled || !catalogQuery.isSuccess || cartSummary.removedLineIds.length === 0) return;
    removeCartLines(cartSummary.removedLineIds);
  }, [enabled, catalogQuery.isSuccess, cartSummary.removedLineIds, removeCartLines]);

  return {
    activeReceiptOrderId,
    activeReceiptToken,
    activeReceiptQueue,
    activeQueueNumber,
    hasMatchingReceiptSession,
    liveReceiptQuery,
  };
}

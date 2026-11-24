import type {
  AdminOrderPaymentFilter,
  AdminOrderRange,
  AdminOrderSort,
  AdminOrderStatusFilter,
  CancelPublicOrderByQueueRequest,
  OrderStatus,
  PaymentStatus,
  PlaceOrderRequest,
} from '@menu-kiosk/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { handleAdminUnauthorizedError } from '@/shared/lib/admin-session-cache';
import { isApiError } from '@/shared/lib/api-error';
import {
  cancelOrderByQueueRequest,
  cancelOrderByReceiptRequest,
  fetchAdminOrders,
  fetchOrderReceipt,
  fetchPublicOrderTracker,
  orderKeys,
  patchAdminOrderPaymentStatus,
  patchAdminOrderStatus,
  placeOrderRequest,
  prepareQueueLookupParam,
  submitOrderPaymentReferenceRequest,
} from '../api/orders-api';

export type OrderLookupQueryOptions = {
  enabled?: boolean;
  suppressLoadingIndicator?: boolean;
};

const RECEIPT_QUERY_META = {
  loadingLabel: 'Loading order receipt…',
} as const;

const RECEIPT_QUERY_SUPPRESSED_META = {
  suppressLoadingIndicator: true,
  loadingLabel: 'Loading order receipt…',
} as const;

const TRACKER_QUERY_META = {
  loadingLabel: 'Looking up order…',
} as const;

const TRACKER_QUERY_SUPPRESSED_META = {
  suppressLoadingIndicator: true,
  loadingLabel: 'Looking up order…',
} as const;

const ADMIN_ORDERS_QUERY_META = {
  loadingLabel: 'Loading customer orders…',
} as const;

const ADMIN_ORDERS_SEARCH_QUERY_META = {
  suppressInitialLoadingIndicator: true,
  loadingLabel: 'Loading customer orders…',
} as const;

export function usePlaceOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { payload: PlaceOrderRequest; idempotencyKey: string }) =>
      placeOrderRequest(params),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Submitting your order…',
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
    onError: (error) => {
      if (isApiError(error) && (error.status === 409 || error.status === 422)) {
        void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      }
    },
  });
}

export function useOrderReceiptQuery(
  orderId: string | null,
  receiptToken: string | null,
  options: boolean | OrderLookupQueryOptions = true,
) {
  const normalizedOptions = typeof options === 'boolean' ? { enabled: options } : options;
  const enabled = normalizedOptions.enabled ?? true;
  return useQuery({
    queryKey: orderKeys.receipt(orderId ?? 'none'),
    queryFn: ({ signal }) => fetchOrderReceipt(orderId ?? '', receiptToken ?? '', signal),
    enabled: Boolean(enabled && orderId && receiptToken),
    meta: normalizedOptions.suppressLoadingIndicator
      ? RECEIPT_QUERY_SUPPRESSED_META
      : RECEIPT_QUERY_META,
    retry: (failureCount, error) => {
      if (
        isApiError(error) &&
        (error.status === 404 || error.status === 401 || error.status === 403)
      ) {
        return false;
      }
      return failureCount < 1;
    },
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const status = query.state.data?.status;
      return status === 'completed' || status === 'cancelled' ? false : 15_000;
    },
  });
}

export function usePublicOrderTrackerQuery(
  queueNumber: string | null,
  options: boolean | OrderLookupQueryOptions = true,
) {
  const normalized = queueNumber ? prepareQueueLookupParam(queueNumber) : '';
  const normalizedOptions = typeof options === 'boolean' ? { enabled: options } : options;
  const enabled = normalizedOptions.enabled ?? true;
  return useQuery({
    queryKey: orderKeys.tracker(normalized || 'none'),
    queryFn: ({ signal }) => fetchPublicOrderTracker(normalized, signal),
    enabled: Boolean(enabled && normalized),
    meta: normalizedOptions.suppressLoadingIndicator
      ? TRACKER_QUERY_SUPPRESSED_META
      : TRACKER_QUERY_META,
    retry: (failureCount, error) => {
      if (isApiError(error) && error.status === 404) {
        return false;
      }
      return failureCount < 1;
    },
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const status = query.state.data?.status;
      return status === 'completed' || status === 'cancelled' ? false : 15_000;
    },
  });
}

export function useSubmitPaymentReferenceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { orderId: string; receiptToken: string; paymentReference: string }) =>
      submitOrderPaymentReferenceRequest(params),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Submitting payment reference…',
    },
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData(orderKeys.receipt(updatedOrder.id), updatedOrder);
      void queryClient.invalidateQueries({
        queryKey: orderKeys.tracker(updatedOrder.queueNumber),
      });
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
  });
}

export function useCancelOrderByReceiptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { orderId: string; receiptToken: string }) =>
      cancelOrderByReceiptRequest(params),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Cancelling your order…',
    },
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData(orderKeys.receipt(updatedOrder.id), updatedOrder);
      void queryClient.invalidateQueries({
        queryKey: orderKeys.tracker(updatedOrder.queueNumber),
      });
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
  });
}

export function useCancelOrderByQueueMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { queueNumber: string; verification: CancelPublicOrderByQueueRequest }) =>
      cancelOrderByQueueRequest(params),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Cancelling your order…',
    },
    onSuccess: (updatedTracker, variables) => {
      queryClient.setQueryData(orderKeys.tracker(updatedTracker.queueNumber), updatedTracker);
      queryClient.setQueryData(orderKeys.tracker(variables.queueNumber), updatedTracker);
      void queryClient.invalidateQueries({ queryKey: [...orderKeys.all, 'tracker'] });
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
  });
}

export type AdminOrdersQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  pauseAutoRefreshWhenPaginated?: boolean;
  limit?: number;
  status?: AdminOrderStatusFilter;
  paymentStatus?: AdminOrderPaymentFilter;
  q?: string;
  range?: AdminOrderRange;
  sort?: AdminOrderSort;
};

export function useAdminOrdersQuery(options: boolean | AdminOrdersQueryOptions = true) {
  const normalized = typeof options === 'boolean' ? { enabled: options } : options;
  const limit = normalized.limit ?? 100;
  const trimmedQ = normalized.q?.trim();
  const filters = {
    limit,
    ...(normalized.status ? { status: normalized.status } : {}),
    ...(normalized.paymentStatus && normalized.paymentStatus !== 'all'
      ? { paymentStatus: normalized.paymentStatus }
      : {}),
    ...(trimmedQ ? { q: trimmedQ } : {}),
    ...(normalized.range ? { range: normalized.range } : {}),
    ...(normalized.sort ? { sort: normalized.sort } : {}),
  };
  return useQuery({
    queryKey: orderKeys.adminList(filters),
    queryFn: ({ signal }) => fetchAdminOrders(filters, signal),
    enabled: normalized.enabled ?? true,
    staleTime: 10_000,
    meta: trimmedQ ? ADMIN_ORDERS_SEARCH_QUERY_META : ADMIN_ORDERS_QUERY_META,
    refetchInterval: normalized.refetchInterval ?? false,
  });
}

export function useInfiniteAdminOrdersQuery(options: AdminOrdersQueryOptions = {}) {
  const limit = options.limit ?? 20;
  const trimmedQ = options.q?.trim();
  const filters = {
    limit,
    ...(options.status ? { status: options.status } : {}),
    ...(options.paymentStatus && options.paymentStatus !== 'all'
      ? { paymentStatus: options.paymentStatus }
      : {}),
    ...(trimmedQ ? { q: trimmedQ } : {}),
    ...(options.range ? { range: options.range } : {}),
    ...(options.sort ? { sort: options.sort } : {}),
  };
  return useInfiniteQuery({
    queryKey: orderKeys.adminInfinite(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchAdminOrders(
        {
          ...filters,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options.enabled ?? true,
    staleTime: 10_000,
    meta: trimmedQ ? ADMIN_ORDERS_SEARCH_QUERY_META : ADMIN_ORDERS_QUERY_META,
    refetchInterval:
      typeof options.refetchInterval === 'number' && options.pauseAutoRefreshWhenPaginated
        ? (query) => ((query.state.data?.pages.length ?? 0) > 1 ? false : options.refetchInterval)
        : (options.refetchInterval ?? false),
  });
}

export function useUpdateOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { orderId: string; status: OrderStatus; expectedVersion?: number }) =>
      patchAdminOrderStatus(params),
    meta: { loadingLabel: 'Updating order status…' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
    onError: (error) => {
      if (handleAdminUnauthorizedError(queryClient, error)) {
        return;
      }
      if (isApiError(error) && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
      }
    },
  });
}

export function useUpdateOrderPaymentStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      orderId: string;
      paymentStatus: PaymentStatus;
      expectedVersion?: number;
    }) => patchAdminOrderPaymentStatus(params),
    meta: { loadingLabel: 'Updating payment status…' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
    onError: (error) => {
      if (handleAdminUnauthorizedError(queryClient, error)) {
        return;
      }
      if (isApiError(error) && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
      }
    },
  });
}

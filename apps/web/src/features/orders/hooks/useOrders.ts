import type {
  AdminOrderRange,
  AdminOrderSort,
  AdminOrderStatusFilter,
  OrderStatus,
  PlaceOrderRequest,
} from '@eight-burgers/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/lib/api-error';
import {
  fetchAdminOrders,
  fetchOrderReceipt,
  orderKeys,
  patchAdminOrderStatus,
  placeOrderRequest,
} from '../api/orders-api';

export function usePlaceOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { payload: PlaceOrderRequest; idempotencyKey: string }) =>
      placeOrderRequest(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      }
    },
  });
}

export function useOrderReceiptQuery(
  orderId: string | null,
  receiptToken: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: orderKeys.receipt(orderId ?? 'none'),
    queryFn: ({ signal }) => fetchOrderReceipt(orderId ?? '', receiptToken ?? '', signal),
    enabled: Boolean(enabled && orderId && receiptToken),
    refetchInterval: (query) => (query.state.data?.status === 'completed' ? false : 15_000),
  });
}

export type AdminOrdersQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  pauseAutoRefreshWhenPaginated?: boolean;
  limit?: number;
  status?: AdminOrderStatusFilter;
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
    ...(trimmedQ ? { q: trimmedQ } : {}),
    ...(normalized.range ? { range: normalized.range } : {}),
    ...(normalized.sort ? { sort: normalized.sort } : {}),
  };
  return useQuery({
    queryKey: orderKeys.adminList(filters),
    queryFn: ({ signal }) => fetchAdminOrders(filters, signal),
    enabled: normalized.enabled ?? true,
    staleTime: 10_000,
    refetchInterval: normalized.refetchInterval ?? false,
  });
}

export function useInfiniteAdminOrdersQuery(options: AdminOrdersQueryOptions = {}) {
  const limit = options.limit ?? 20;
  const trimmedQ = options.q?.trim();
  const filters = {
    limit,
    ...(options.status ? { status: options.status } : {}),
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 401) {
        void queryClient.cancelQueries({ queryKey: ['admin'] });
        queryClient.removeQueries({ queryKey: orderKeys.adminAll });
        queryClient.setQueryData(['admin', 'auth', 'session'], {
          authenticated: false,
          user: null,
        });
      } else if (isApiError(error) && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: orderKeys.adminAll });
      }
    },
  });
}

import {
  adminOrdersResponseSchema,
  normalizeQueueNumber,
  orderReceiptResponseSchema,
  placeOrderResponseSchema,
  publicOrderTrackerResponseSchema,
  type AdminOrderRange,
  type AdminOrderSort,
  type AdminOrderStatusFilter,
  type AdminOrdersResponse,
  type CancelPublicOrderByQueueRequest,
  type OrderRecord,
  type OrderStatus,
  type PlaceOrderRequest,
  type PlaceOrderResponse,
  type PublicOrderTracker,
} from '@eight-burgers/contracts';
import { apiRequest } from '@/shared/lib/http-client';

export type AdminOrdersFilterParams = {
  status?: AdminOrderStatusFilter;
  q?: string;
  range?: AdminOrderRange;
  sort?: AdminOrderSort;
  limit?: number;
};

export const orderKeys = {
  all: ['orders'] as const,
  receipt: (orderId: string) => [...orderKeys.all, 'receipt', orderId] as const,
  tracker: (queueNumber: string) =>
    [...orderKeys.all, 'tracker', normalizeQueueNumber(queueNumber)] as const,
  adminAll: ['admin', 'orders'] as const,
  adminList: (filters?: AdminOrdersFilterParams) =>
    [...orderKeys.adminAll, 'list', filters ?? {}] as const,
  adminInfinite: (filters?: AdminOrdersFilterParams) =>
    [...orderKeys.adminAll, 'infinite', filters ?? {}] as const,
};

export async function placeOrderRequest(params: {
  payload: PlaceOrderRequest;
  idempotencyKey: string;
}): Promise<PlaceOrderResponse> {
  return apiRequest('/orders', {
    method: 'POST',
    body: params.payload,
    headers: {
      'Idempotency-Key': params.idempotencyKey,
    },
    schema: placeOrderResponseSchema,
  });
}

export async function fetchOrderReceipt(
  orderId: string,
  receiptToken: string,
  signal?: AbortSignal,
): Promise<OrderRecord> {
  const res = await apiRequest(`/orders/${encodeURIComponent(orderId)}`, {
    signal,
    headers: {
      'X-Order-Receipt-Token': receiptToken,
    },
    schema: orderReceiptResponseSchema,
  });
  return res.data;
}

export async function fetchPublicOrderTracker(
  queueNumber: string,
  signal?: AbortSignal,
): Promise<PublicOrderTracker> {
  const normalized = normalizeQueueNumber(queueNumber);
  const res = await apiRequest(`/orders/track/${encodeURIComponent(normalized)}`, {
    signal,
    schema: publicOrderTrackerResponseSchema,
  });
  return res.data;
}

export async function cancelOrderByReceiptRequest(params: {
  orderId: string;
  receiptToken: string;
}): Promise<OrderRecord> {
  const res = await apiRequest(`/orders/${encodeURIComponent(params.orderId)}/cancel`, {
    method: 'POST',
    headers: {
      'X-Order-Receipt-Token': params.receiptToken,
    },
    schema: orderReceiptResponseSchema,
  });
  return res.data;
}

export async function cancelOrderByQueueRequest(params: {
  queueNumber: string;
  verification: CancelPublicOrderByQueueRequest;
}): Promise<PublicOrderTracker> {
  const normalized = normalizeQueueNumber(params.queueNumber);
  const res = await apiRequest(`/orders/track/${encodeURIComponent(normalized)}/cancel`, {
    method: 'POST',
    body: params.verification,
    schema: publicOrderTrackerResponseSchema,
  });
  return res.data;
}

export async function fetchAdminOrders(
  params: AdminOrdersFilterParams & { cursor?: string } = {},
  signal?: AbortSignal,
): Promise<AdminOrdersResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.range) search.set('range', params.range);
  if (params.sort) search.set('sort', params.sort);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  const queryString = search.toString();

  return apiRequest(`/admin/orders${queryString ? `?${queryString}` : ''}`, {
    signal,
    schema: adminOrdersResponseSchema,
  });
}

export async function patchAdminOrderStatus(params: {
  orderId: string;
  status: OrderStatus;
  expectedVersion?: number;
}): Promise<OrderRecord> {
  const res = await apiRequest(`/admin/orders/${encodeURIComponent(params.orderId)}/status`, {
    method: 'PATCH',
    body: {
      status: params.status,
      ...(params.expectedVersion !== undefined ? { expectedVersion: params.expectedVersion } : {}),
    },
    schema: orderReceiptResponseSchema,
  });
  return res.data;
}

import {
  DEFAULT_STORE_PROFILE,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  getAdminPermissions,
  type AdminOrderCounts,
  type AdminOrderPaymentFilter,
  type AdminOrderRange,
  type AdminOrderSort,
  type AdminOrderStatusFilter,
  type AdminRole,
  type PaymentStatus,
} from '@menu-kiosk/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCatalogQuery } from '@/features/menu-catalog';
import { StoreOrderingStatusToggle } from '@/features/store-settings';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { buildGoogleMapsPinUrl, formatPhp, isValidCoordinates } from '@/shared/shop/shop-storage';
import type { FulfillmentMode, OrderRecord, OrderStatus } from '@/shared/shop/types';
import { orderKeys } from '../api/orders-api';
import {
  useInfiniteAdminOrdersQuery,
  useUpdateOrderPaymentStatusMutation,
  useUpdateOrderStatusMutation,
} from '../hooks/useOrders';

const ORDERS_PAGE_SIZE = 20;
const AUTO_REFRESH_MS = 15_000;
const SEARCH_DEBOUNCE_MS = 250;

type StatusBanner = {
  tone: 'success' | 'error';
  message: string;
};

const RANGE_OPTIONS: readonly { value: AdminOrderRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
];

function getFulfillmentDisplayLabel(fulfillment: FulfillmentMode): string {
  switch (fulfillment) {
    case 'pickup':
      return 'Pickup';
    case 'delivery':
      return 'Delivery';
    case 'dine-in':
      return 'Dine-in';
  }
}

function getPaymentStatusBadgeClasses(paymentStatus: PaymentStatus): string {
  switch (paymentStatus) {
    case 'paid':
      return 'border-ui-accent/50 bg-ui-surface-muted text-ui-accent';
    case 'pending_verification':
      return 'border-ui-accent bg-ui-accent text-ui-on-accent';
    case 'unpaid':
      return 'border-ui-border bg-ui-surface-muted text-ui-text-muted';
  }
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatOrderTimestamp(iso: string, now = new Date()): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (isSameLocalDay(date, now)) {
    return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatElapsedWait(iso: string, nowMs: number): string | null {
  const createdMs = Date.parse(iso);
  if (Number.isNaN(createdMs)) return null;
  const diffMin = Math.floor((nowMs - createdMs) / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type AdminOrdersManagerProps = {
  role?: AdminRole;
};

export function AdminOrdersManager({ role = 'owner' }: AdminOrdersManagerProps) {
  const { canPauseOrders, canConfirmPayment } = getAdminPermissions(role);
  const catalogQuery = useCatalogQuery();
  const store = catalogQuery.data?.store ?? DEFAULT_STORE_PROFILE;
  const preparingLabel = store.preparingStageLabel || 'Preparing';

  const orderStatusOptions: readonly { value: OrderStatus; label: string }[] = useMemo(
    () => [
      { value: 'received', label: 'Received' },
      { value: 'preparing', label: preparingLabel },
      { value: 'ready', label: 'Ready for Pickup / Dispatch' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    [preparingLabel],
  );

  const orderStatusLabels = useMemo(
    () => new Map<OrderStatus, string>(orderStatusOptions.map((o) => [o.value, o.label])),
    [orderStatusOptions],
  );

  const filterOptions: readonly { value: AdminOrderStatusFilter; label: string }[] = useMemo(
    () => [
      { value: 'active', label: 'Active' },
      { value: 'received', label: 'Received' },
      { value: 'preparing', label: preparingLabel },
      { value: 'ready', label: 'Ready' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'all', label: 'All' },
    ],
    [preparingLabel],
  );

  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AdminOrderStatusFilter>('active');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<AdminOrderPaymentFilter>('all');
  const [dateRange, setDateRange] = useState<AdminOrderRange>('all');
  const [sortOrder, setSortOrder] = useState<AdminOrderSort>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [pendingOrderIds, setPendingOrderIds] = useState<ReadonlySet<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const effectiveSearch = searchQuery.trim() ? debouncedSearch : '';

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const ordersQuery = useInfiniteAdminOrdersQuery({
    enabled: true,
    limit: ORDERS_PAGE_SIZE,
    status: statusFilter,
    paymentStatus: paymentStatusFilter,
    range: dateRange,
    sort: sortOrder,
    q: effectiveSearch,
    refetchInterval: autoRefresh ? AUTO_REFRESH_MS : false,
    pauseAutoRefreshWhenPaginated: true,
  });
  const updateOrderStatusMutation = useUpdateOrderStatusMutation();
  const updateOrderPaymentStatusMutation = useUpdateOrderPaymentStatusMutation();

  useEffect(() => {
    if (isApiError(ordersQuery.error) && ordersQuery.error.status === 401) {
      void queryClient.cancelQueries({ queryKey: ['admin'] });
      queryClient.removeQueries({ queryKey: orderKeys.adminAll });
      queryClient.setQueryData(['admin', 'auth', 'session'], {
        authenticated: false,
        user: null,
      });
    }
  }, [ordersQuery.error, queryClient]);

  const setOrderPending = useCallback((orderId: string, pending: boolean) => {
    setPendingOrderIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);

  const loadedPageCount = ordersQuery.data?.pages.length ?? 0;
  const isAutoRefreshPausedByPagination = autoRefresh && loadedPageCount > 1;

  const orders = useMemo(() => {
    const pages = ordersQuery.data?.pages ?? [];
    const seen = new Set<string>();
    const flattened: OrderRecord[] = [];
    for (const page of pages) {
      for (const order of page.data) {
        if (seen.has(order.id)) continue;
        seen.add(order.id);
        flattened.push(order);
      }
    }
    return flattened;
  }, [ordersQuery.data?.pages]);

  const counts: AdminOrderCounts = useMemo(() => {
    const serverCounts = ordersQuery.data?.pages[0]?.counts;
    if (serverCounts) return serverCounts;

    let received = 0;
    let preparing = 0;
    let ready = 0;
    let completed = 0;
    let cancelled = 0;
    let pendingVerification = 0;
    for (const order of orders) {
      if (order.status === 'received') received += 1;
      else if (order.status === 'preparing') preparing += 1;
      else if (order.status === 'ready') ready += 1;
      else if (order.status === 'completed') completed += 1;
      else if (order.status === 'cancelled') cancelled += 1;
      if (order.paymentStatus === 'pending_verification' && order.status !== 'cancelled') {
        pendingVerification += 1;
      }
    }
    return {
      all: orders.length,
      active: received + preparing + ready,
      received,
      preparing,
      ready,
      completed,
      cancelled,
      pendingVerification,
    };
  }, [ordersQuery.data?.pages, orders]);

  const paymentFilterOptions: readonly { value: AdminOrderPaymentFilter; label: string }[] =
    useMemo(
      () => [
        { value: 'all', label: 'All payments' },
        {
          value: 'pending_verification',
          label: `Pending review (${counts.pendingVerification})`,
        },
        { value: 'unpaid', label: 'Unpaid' },
        { value: 'paid', label: 'Paid' },
      ],
      [counts.pendingVerification],
    );

  const hasActiveFilters =
    statusFilter !== 'all' ||
    paymentStatusFilter !== 'all' ||
    dateRange !== 'all' ||
    searchQuery.trim().length > 0;
  const isRefreshing = ordersQuery.isFetching && !ordersQuery.isFetchingNextPage;
  const hasBackgroundRefreshError =
    ordersQuery.isError && orders.length > 0 && !ordersQuery.isFetchNextPageError;
  const activeStageTotal = counts[statusFilter];
  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);

  function resetToLatestPage() {
    void queryClient.resetQueries({ queryKey: orderKeys.adminAll });
  }

  return (
    <div className="space-y-8 pb-24">
      <section className="flex flex-col gap-4 border-b border-ui-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ui-text">Customer Orders</h1>
          <p className="mt-1 text-sm text-ui-text-muted">
            Monitor incoming pickup, dine-in, and delivery orders, review payment references, and
            update kitchen progress in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs font-medium text-ui-text">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
              className="accent-ui-accent h-4 w-4 rounded"
            />
            <span>Auto-refresh (15s)</span>
          </label>

          <button
            type="button"
            disabled={isRefreshing}
            onClick={() => void ordersQuery.refetch()}
            className="shrink-0 rounded-xl border border-ui-border bg-ui-surface px-4 py-2 text-sm font-medium text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {canPauseOrders ? (
        <StoreOrderingStatusToggle
          compact
          onStatusMessage={(message, tone = 'success') => setStatusBanner({ tone, message })}
        />
      ) : null}

      <section
        aria-label="Order metrics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">Active orders</p>
          <p className="mt-1 text-2xl font-bold text-ui-accent tabular-nums">{counts.active}</p>
        </div>
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">Received</p>
          <p className="mt-1 text-2xl font-bold text-ui-text tabular-nums">{counts.received}</p>
        </div>
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">{preparingLabel}</p>
          <p className="mt-1 text-2xl font-bold text-ui-text tabular-nums">{counts.preparing}</p>
        </div>
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">Pending review</p>
          <p className="mt-1 text-2xl font-bold text-ui-accent tabular-nums">
            {counts.pendingVerification}
          </p>
        </div>
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">Completed</p>
          <p className="mt-1 text-2xl font-bold text-ui-text tabular-nums">{counts.completed}</p>
        </div>
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

      {hasBackgroundRefreshError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-xl border border-ui-error/40 bg-ui-surface px-4 py-3 text-xs text-ui-error sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            Live refresh failed — showing last loaded orders. (
            {getApiErrorMessage(ordersQuery.error, 'Network error')})
          </span>
          <button
            type="button"
            onClick={() => void ordersQuery.refetch()}
            className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isAutoRefreshPausedByPagination ? (
        <div
          role="status"
          className="flex flex-col items-start gap-2 rounded-xl border border-ui-border bg-ui-surface-muted px-4 py-2.5 text-xs text-ui-text-muted sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            Auto-refresh paused while browsing older pages ({orders.length} orders loaded).
          </span>
          <button
            type="button"
            onClick={resetToLatestPage}
            className="rounded-lg border border-ui-border bg-ui-surface px-3 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Back to latest
          </button>
        </div>
      ) : null}

      <section aria-labelledby="orders-ledger-heading" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="orders-ledger-heading" className="text-lg font-bold text-ui-text tabular-nums">
            Recent Customer Orders ({activeStageTotal})
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              maxLength={100}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search queue #, name, table, ref..."
              aria-label="Search customer orders"
              className="min-w-0 flex-1 rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-sm text-ui-text sm:w-64 sm:flex-none"
            />
            <select
              aria-label="Filter orders by date range"
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as AdminOrderRange)}
              className="rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-medium text-ui-text"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort orders"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as AdminOrderSort)}
              className="rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-medium text-ui-text"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first (FIFO)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2.5">
          <div role="group" aria-label="Filter orders by status" className="flex flex-wrap gap-2">
            {filterOptions.map((option) => {
              const isSelected = statusFilter === option.value;
              const count = counts[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setStatusFilter(option.value)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors motion-reduce:transition-none ${
                    isSelected
                      ? 'border-ui-accent bg-ui-accent text-ui-on-accent'
                      : 'border-ui-border bg-ui-surface text-ui-text hover:bg-ui-surface-muted'
                  }`}
                >
                  {option.label} ({count})
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Filter orders by payment status"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs font-semibold text-ui-text-muted">Payment:</span>
            {paymentFilterOptions.map((option) => {
              const isSelected = paymentStatusFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setPaymentStatusFilter(option.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors motion-reduce:transition-none ${
                    isSelected
                      ? 'border-ui-accent bg-ui-surface-muted text-ui-accent'
                      : 'border-ui-border bg-ui-surface text-ui-text-muted hover:text-ui-text'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {ordersQuery.isPending ? (
          <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-sm text-ui-text-muted">
            Loading customer orders…
          </div>
        ) : ordersQuery.isError && orders.length === 0 ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-2xl border border-ui-error/40 bg-ui-surface p-6 text-sm text-ui-error sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{getApiErrorMessage(ordersQuery.error, 'Unable to load customer orders.')}</span>
            <button
              type="button"
              onClick={() => void ordersQuery.refetch()}
              className="rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
            >
              Retry
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-center text-sm text-ui-text-muted">
            <p className="font-semibold text-ui-text">
              {counts.all === 0 &&
              !searchQuery.trim() &&
              dateRange === 'all' &&
              paymentStatusFilter === 'all'
                ? 'No orders placed yet.'
                : 'No orders match your current filter.'}
            </p>
            {counts.all === 0 &&
            !searchQuery.trim() &&
            dateRange === 'all' &&
            paymentStatusFilter === 'all' ? (
              <p className="mt-1">
                Add items from the Menu page and complete checkout via the bottom-right cart icon to
                see incoming orders here.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setPaymentStatusFilter('all');
                      setDateRange('all');
                      setSearchQuery('');
                      setDebouncedSearch('');
                    }}
                    className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface"
                  >
                    Reset order filters
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {orders.map((order) => {
                const formattedTime = formatOrderTimestamp(order.createdAtIso, nowDate);
                const elapsedLabel =
                  order.status !== 'completed' && order.status !== 'cancelled'
                    ? formatElapsedWait(order.createdAtIso, nowMs)
                    : null;
                const isUpdatingOrder = pendingOrderIds.has(order.id);
                const paymentMethodLabel =
                  PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod.toUpperCase();
                const paymentStatusLabel = PAYMENT_STATUS_LABELS[order.paymentStatus];

                return (
                  <article
                    key={order.id}
                    className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 ${
                      order.status === 'cancelled'
                        ? 'border-ui-error/40 bg-ui-surface-muted/70'
                        : 'border-ui-border bg-ui-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-ui-border pb-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                              order.status === 'cancelled'
                                ? 'bg-ui-error/15 text-ui-error line-through'
                                : 'bg-ui-accent text-ui-on-accent'
                            }`}
                          >
                            {order.queueNumber}
                          </span>
                          <h3 className="text-sm font-semibold text-ui-text">
                            {order.customerName}
                          </h3>
                          {order.fulfillment === 'dine-in' && order.tableNumber ? (
                            <span className="rounded-md border border-ui-border bg-ui-surface-muted px-2 py-0.5 text-[11px] font-bold text-ui-text">
                              Table {order.tableNumber}
                            </span>
                          ) : null}
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getPaymentStatusBadgeClasses(order.paymentStatus)}`}
                          >
                            {paymentStatusLabel}
                          </span>
                          {order.status === 'cancelled' ? (
                            <span className="rounded-md border border-ui-error/40 bg-ui-error/10 px-2 py-0.5 text-[11px] font-semibold text-ui-error">
                              Cancelled
                            </span>
                          ) : null}
                          {elapsedLabel ? (
                            <span className="text-xs text-ui-text-muted tabular-nums">
                              {elapsedLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-ui-text-muted">
                          {getFulfillmentDisplayLabel(order.fulfillment)} · {paymentMethodLabel}
                          {order.contactNumber ? ` · ${order.contactNumber}` : ''}
                          {formattedTime ? ` · ${formattedTime}` : ''}
                        </p>
                      </div>

                      <select
                        aria-label={`Order status for ${order.queueNumber}`}
                        disabled={isUpdatingOrder}
                        value={order.status}
                        onChange={(event) => {
                          const nextStatus = event.target.value as OrderStatus;
                          setOrderPending(order.id, true);
                          void updateOrderStatusMutation
                            .mutateAsync({
                              orderId: order.id,
                              status: nextStatus,
                              expectedVersion: order.version,
                            })
                            .then(() => {
                              const label = orderStatusLabels.get(nextStatus) ?? nextStatus;
                              setStatusBanner({
                                tone: 'success',
                                message: `Updated ${order.queueNumber} status to ${label}.`,
                              });
                            })
                            .catch((error: unknown) => {
                              setStatusBanner({
                                tone: 'error',
                                message: getApiErrorMessage(
                                  error,
                                  'Failed to update order status.',
                                ),
                              });
                            })
                            .finally(() => {
                              setOrderPending(order.id, false);
                            });
                        }}
                        className="rounded-lg border border-ui-border bg-ui-canvas px-2.5 py-1 text-xs font-medium text-ui-text disabled:opacity-60"
                      >
                        {orderStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <ul className="space-y-1.5 text-xs text-ui-text">
                      {order.lines.map((line) => {
                        const optionNames =
                          line.selectedOptions && line.selectedOptions.length > 0
                            ? line.selectedOptions.map((option) => option.choiceName)
                            : line.addonNames;
                        const trimmedNote = line.itemNote?.trim();
                        return (
                          <li key={line.lineId} className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="font-semibold tabular-nums">{line.quantity}×</span>{' '}
                              {line.name}
                              {optionNames.length > 0 ? (
                                <span className="text-ui-text-muted">
                                  {' '}
                                  (+{optionNames.join(', ')})
                                </span>
                              ) : null}
                              {trimmedNote ? (
                                <span className="mt-0.5 block text-[11px] font-medium text-ui-accent">
                                  Note: {trimmedNote}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 font-medium tabular-nums">
                              {formatPhp(line.lineTotalPhp)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>

                    {order.paymentReference ||
                    order.addressOrNotes ||
                    (order.fulfillment === 'delivery' && isValidCoordinates(order.deliveryPin)) ? (
                      <div className="space-y-1 rounded-lg bg-ui-surface-muted px-2.5 py-1.5 text-xs text-ui-text-muted">
                        {order.paymentReference ? (
                          <p className="text-ui-text">
                            <span className="font-semibold">Payment ref:</span>{' '}
                            <span className="font-mono">{order.paymentReference}</span>
                          </p>
                        ) : null}
                        {order.addressOrNotes ? <p>Note: {order.addressOrNotes}</p> : null}
                        {order.fulfillment === 'delivery' &&
                        isValidCoordinates(order.deliveryPin) ? (
                          <p className="tabular-nums">
                            Pin:{' '}
                            <a
                              href={buildGoogleMapsPinUrl(order.deliveryPin)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-ui-accent underline underline-offset-2"
                            >
                              Google Maps
                            </a>
                            {typeof order.deliveryDistanceKm === 'number'
                              ? ` (~${order.deliveryDistanceKm.toFixed(1)} km)`
                              : ''}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-2 border-t border-ui-border pt-2.5 text-xs tabular-nums">
                      {order.fulfillment === 'delivery' ? (
                        <div className="flex items-center justify-between text-ui-text-muted">
                          <span>
                            Delivery fee
                            {order.deliveryEtaMinutes ? ` (${order.deliveryEtaMinutes})` : ''}
                          </span>
                          <span>
                            {order.deliveryFeePhp > 0
                              ? formatPhp(order.deliveryFeePhp)
                              : order.deliveryFeeWaived
                                ? 'Free (min. met)'
                                : 'Free'}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-sm font-bold text-ui-text">
                        <span>Total</span>
                        <span className="text-ui-accent">{formatPhp(order.totalPhp)}</span>
                      </div>

                      {canConfirmPayment && order.status !== 'cancelled' ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ui-border/60 pt-2">
                          <span className="text-[11px] text-ui-text-muted">
                            {paymentMethodLabel} · {paymentStatusLabel}
                          </span>
                          {order.paymentStatus !== 'paid' ? (
                            <button
                              type="button"
                              disabled={isUpdatingOrder}
                              aria-label={`Mark ${order.queueNumber} paid`}
                              onClick={() => {
                                setOrderPending(order.id, true);
                                void updateOrderPaymentStatusMutation
                                  .mutateAsync({
                                    orderId: order.id,
                                    paymentStatus: 'paid',
                                    expectedVersion: order.version,
                                  })
                                  .then(() => {
                                    setStatusBanner({
                                      tone: 'success',
                                      message: `Marked ${order.queueNumber} as paid.`,
                                    });
                                  })
                                  .catch((error: unknown) => {
                                    setStatusBanner({
                                      tone: 'error',
                                      message: getApiErrorMessage(
                                        error,
                                        'Failed to update payment status.',
                                      ),
                                    });
                                  })
                                  .finally(() => {
                                    setOrderPending(order.id, false);
                                  });
                              }}
                              className="rounded-lg bg-ui-accent px-2.5 py-1 text-xs font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
                            >
                              Mark paid
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isUpdatingOrder}
                              aria-label={`Revert ${order.queueNumber} to unpaid`}
                              onClick={() => {
                                setOrderPending(order.id, true);
                                void updateOrderPaymentStatusMutation
                                  .mutateAsync({
                                    orderId: order.id,
                                    paymentStatus: 'unpaid',
                                    expectedVersion: order.version,
                                  })
                                  .then(() => {
                                    setStatusBanner({
                                      tone: 'success',
                                      message: `Reverted ${order.queueNumber} to unpaid.`,
                                    });
                                  })
                                  .catch((error: unknown) => {
                                    setStatusBanner({
                                      tone: 'error',
                                      message: getApiErrorMessage(
                                        error,
                                        'Failed to update payment status.',
                                      ),
                                    });
                                  })
                                  .finally(() => {
                                    setOrderPending(order.id, false);
                                  });
                              }}
                              className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-60"
                            >
                              Revert to unpaid
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>

            {ordersQuery.isFetchNextPageError ? (
              <div
                role="alert"
                className="flex flex-col items-start gap-2 rounded-xl border border-ui-error/40 bg-ui-surface px-4 py-3 text-xs text-ui-error sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  {getApiErrorMessage(ordersQuery.error, 'Unable to load older customer orders.')}
                </span>
                <button
                  type="button"
                  onClick={() => void ordersQuery.fetchNextPage()}
                  className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {ordersQuery.hasNextPage ? (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-xs text-ui-text-muted tabular-nums">
                  Showing {orders.length} of {activeStageTotal} orders
                </p>
                <button
                  type="button"
                  disabled={ordersQuery.isFetchingNextPage}
                  onClick={() => void ordersQuery.fetchNextPage()}
                  className="rounded-xl border border-ui-border bg-ui-surface px-5 py-2.5 text-sm font-semibold text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
                >
                  {ordersQuery.isFetchingNextPage ? 'Loading more orders…' : 'Load more orders'}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

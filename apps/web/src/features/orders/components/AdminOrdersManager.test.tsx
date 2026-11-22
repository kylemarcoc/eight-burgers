import type { OrderRecord } from '@eight-burgers/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthGuard } from '@/features/admin-auth';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminOrdersManager } from './AdminOrdersManager';

const SAMPLE_ORDERS: OrderRecord[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    queueNumber: '#8B-101',
    customerName: 'Marco Santos',
    contactNumber: '09171234567',
    fulfillment: 'delivery',
    deliveryZoneId: 'makati-core',
    deliveryZoneName: 'Makati Core',
    deliveryEtaMinutes: '20–30 min',
    deliveryPin: { lat: 14.5547, lng: 121.0244 },
    deliveryDistanceKm: 1.4,
    addressOrNotes: 'Leave with lobby guard',
    paymentMethod: 'gcash',
    lines: [
      {
        lineId: 'burger-deluxe',
        itemId: 'burger-deluxe',
        name: 'Burger Deluxe',
        unitPricePhp: 148,
        addonNames: ['Extra Cheese'],
        addonsPricePhp: 25,
        quantity: 2,
        lineTotalPhp: 346,
      },
    ],
    subtotalPhp: 346,
    deliveryFeePhp: 45,
    totalPhp: 391,
    status: 'received',
    createdAtIso: '2026-11-22T04:15:00.000Z',
    version: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    queueNumber: '#8B-102',
    customerName: 'Ana Reyes',
    contactNumber: '',
    fulfillment: 'kiosk-pickup',
    addressOrNotes: '',
    paymentMethod: 'cash',
    lines: [
      {
        lineId: 'chicano-burger',
        itemId: 'chicano-burger',
        name: 'Chicano Burger',
        unitPricePhp: 168,
        addonNames: [],
        addonsPricePhp: 0,
        quantity: 1,
        lineTotalPhp: 168,
      },
    ],
    subtotalPhp: 168,
    deliveryFeePhp: 0,
    totalPhp: 168,
    status: 'completed',
    createdAtIso: '2026-11-22T04:10:00.000Z',
    version: 3,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminOrdersManager', () => {
  it('renders empty state when no orders have been placed yet', async () => {
    installMockShopApi({ authenticated: true, initialOrders: [] });
    render(
      <TestQueryWrapper>
        <AdminOrdersManager />
      </TestQueryWrapper>,
    );

    expect(await screen.findByText('No orders placed yet.')).toBeTruthy();
  });

  it('defaults to active orders, supports server-side status/search filters, and resets empty filters', async () => {
    installMockShopApi({ authenticated: true, initialOrders: SAMPLE_ORDERS });
    render(
      <TestQueryWrapper>
        <AdminOrdersManager />
      </TestQueryWrapper>,
    );

    // Defaults to Active queue so completed orders do not crowd page 1
    expect(await screen.findByRole('heading', { level: 3, name: 'Marco Santos' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Ana Reyes' })).toBeNull();
    expect(screen.getByRole('button', { name: /^completed \(1\)$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^completed \(1\)$/i }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Ana Reyes' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Marco Santos' })).toBeNull();

    fireEvent.change(screen.getByLabelText(/search customer orders/i), {
      target: { value: 'nonexistent-order' },
    });
    expect(await screen.findByText('No orders match your current filter.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /reset order filters/i }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Marco Santos' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Ana Reyes' })).toBeTruthy();
  });

  it('loads older orders with composite cursor pagination, pauses auto-refresh past page 1, and supports FIFO sorting', async () => {
    const paginatedOrders: OrderRecord[] = Array.from({ length: 23 }, (_, index) => {
      const seq = 200 - index;
      const minute = String(59 - index).padStart(2, '0');
      return {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        queueNumber: `#8B-${seq}`,
        customerName: `Customer ${seq}`,
        contactNumber: '',
        fulfillment: 'kiosk-pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        lines: [
          {
            lineId: 'burger-deluxe',
            itemId: 'burger-deluxe',
            name: 'Burger Deluxe',
            unitPricePhp: 148,
            addonNames: [],
            addonsPricePhp: 0,
            quantity: 1,
            lineTotalPhp: 148,
          },
        ],
        subtotalPhp: 148,
        deliveryFeePhp: 0,
        totalPhp: 148,
        status: 'received',
        createdAtIso: `2026-11-22T04:${minute}:00.000Z`,
        version: 1,
      };
    });

    installMockShopApi({ authenticated: true, initialOrders: paginatedOrders });
    render(
      <TestQueryWrapper>
        <AdminOrdersManager />
      </TestQueryWrapper>,
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Customer 200' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Customer 181' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Customer 180' })).toBeNull();
    expect(screen.getByText('Showing 20 of 23 orders')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /load more orders/i }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Customer 180' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Customer 178' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /load more orders/i })).toBeNull();
    expect(screen.getByText(/auto-refresh paused while browsing older pages/i)).toBeTruthy();

    // Switch to FIFO (Oldest first) to surface oldest waiting ticket first
    fireEvent.change(screen.getByLabelText(/sort orders/i), { target: { value: 'asc' } });
    expect(await screen.findByRole('heading', { level: 3, name: 'Customer 178' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Customer 200' })).toBeNull();
  });

  it('updates order status with optimistic locking and announces the change', async () => {
    installMockShopApi({ authenticated: true, initialOrders: SAMPLE_ORDERS });
    render(
      <TestQueryWrapper>
        <AdminOrdersManager />
      </TestQueryWrapper>,
    );

    const statusSelect = await screen.findByLabelText(/order status for #8b-101/i);
    fireEvent.change(statusSelect, { target: { value: 'grilling' } });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Updated #8B-101 status to On the Grill.',
      );
    });
    expect(screen.getByRole('button', { name: /^on the grill \(1\)$/i })).toBeTruthy();
  });

  it('surfaces conflict errors as an alert when order version is stale', async () => {
    const { state } = installMockShopApi({ authenticated: true, initialOrders: SAMPLE_ORDERS });
    render(
      <TestQueryWrapper>
        <AdminOrdersManager />
      </TestQueryWrapper>,
    );

    const statusSelect = await screen.findByLabelText(/order status for #8b-101/i);
    const targetOrder = state.orders.find((entry) => entry.queueNumber === '#8B-101');
    if (targetOrder) targetOrder.version = 99;

    fireEvent.change(statusSelect, { target: { value: 'ready' } });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'Order status was updated on another device.',
      );
    });
  });

  it('transitions cleanly back to sign-in when /admin/orders returns 401', async () => {
    const { state } = installMockShopApi({ authenticated: true, initialOrders: SAMPLE_ORDERS });
    render(
      <TestQueryWrapper>
        <AdminAuthGuard>
          <AdminOrdersManager />
        </AdminAuthGuard>
      </TestQueryWrapper>,
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Marco Santos' })).toBeTruthy();

    // Expire server session and trigger a refresh
    state.authenticated = false;
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /owner admin sign-in/i }),
    ).toBeTruthy();
  });
});

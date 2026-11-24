import type { OrderRecord } from '@menu-kiosk/contracts';
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
    tableNumber: '',
    deliveryEtaMinutes: '20–30 min',
    deliveryPin: { lat: 14.5547, lng: 121.0244 },
    deliveryDistanceKm: 1.4,
    addressOrNotes: 'Leave with lobby guard',
    paymentMethod: 'gcash',
    paymentStatus: 'pending_verification',
    paymentReference: 'GCASH-882190',
    lines: [
      {
        lineId: 'burger-deluxe',
        itemId: 'burger-deluxe',
        name: 'Burger Deluxe',
        unitPricePhp: 148,
        selectedOptions: [
          {
            groupId: 'add-ons',
            groupName: 'Add-ons',
            choiceId: 'sliced-cheese',
            choiceName: 'Extra Cheese',
            priceDeltaPhp: 25,
          },
        ],
        addonNames: ['Extra Cheese'],
        itemNote: 'No onions please',
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
    fulfillment: 'pickup',
    tableNumber: '',
    addressOrNotes: '',
    paymentMethod: 'cash',
    paymentStatus: 'unpaid',
    paymentReference: '',
    lines: [
      {
        lineId: 'chicano-burger',
        itemId: 'chicano-burger',
        name: 'Chicano Burger',
        unitPricePhp: 168,
        selectedOptions: [],
        addonNames: [],
        itemNote: '',
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
    expect(screen.getByText('Note: No onions please')).toBeTruthy();
    expect(screen.getByText('GCASH-882190')).toBeTruthy();
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
        fulfillment: 'pickup',
        tableNumber: '',
        addressOrNotes: '',
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        paymentReference: '',
        lines: [
          {
            lineId: 'burger-deluxe',
            itemId: 'burger-deluxe',
            name: 'Burger Deluxe',
            unitPricePhp: 148,
            selectedOptions: [],
            addonNames: [],
            itemNote: '',
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
    fireEvent.change(statusSelect, { target: { value: 'preparing' } });

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
      await screen.findByRole('heading', { level: 1, name: /staff portal sign-in/i }),
    ).toBeTruthy();
  });

  it('excludes cancelled orders from the active queue and filters them under Cancelled', async () => {
    installMockShopApi({
      authenticated: true,
      initialOrders: [
        ...SAMPLE_ORDERS,
        {
          id: '00000000-0000-4000-8000-000000000103',
          queueNumber: '#8B-103',
          customerName: 'Cancelled Guest',
          contactNumber: '',
          fulfillment: 'pickup',
          tableNumber: '',
          addressOrNotes: '',
          paymentMethod: 'cash',
          paymentStatus: 'unpaid',
          paymentReference: '',
          lines: [
            {
              lineId: 'burger-deluxe',
              itemId: 'burger-deluxe',
              name: 'Burger Deluxe',
              unitPricePhp: 148,
              selectedOptions: [],
              addonNames: [],
              itemNote: '',
              addonsPricePhp: 0,
              quantity: 1,
              lineTotalPhp: 148,
            },
          ],
          subtotalPhp: 148,
          deliveryFeePhp: 0,
          totalPhp: 148,
          status: 'cancelled',
          createdAtIso: '2026-11-22T04:12:00.000Z',
          version: 2,
        },
      ],
    });

    render(
      <TestQueryWrapper>
        <AdminOrdersManager />
      </TestQueryWrapper>,
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Marco Santos' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Cancelled Guest' })).toBeNull();
    expect(screen.getByRole('button', { name: /^active \(1\)$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^cancelled \(1\)$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^cancelled \(1\)$/i }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Cancelled Guest' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Marco Santos' })).toBeNull();
  });

  it('shows StoreOrderingStatusToggle and payment confirmation controls for Cashier (including Cash & Dine-in Table badge) and hides them from Staff', async () => {
    const dineInCashOrder: OrderRecord = {
      id: '00000000-0000-4000-8000-000000000104',
      queueNumber: '#8B-104',
      customerName: 'Tessa Lim',
      contactNumber: '',
      fulfillment: 'dine-in',
      tableNumber: '7',
      addressOrNotes: '',
      paymentMethod: 'cash',
      paymentStatus: 'unpaid',
      paymentReference: '',
      lines: [
        {
          lineId: 'burger-deluxe',
          itemId: 'burger-deluxe',
          name: 'Burger Deluxe',
          unitPricePhp: 148,
          selectedOptions: [],
          addonNames: [],
          itemNote: '',
          addonsPricePhp: 0,
          quantity: 1,
          lineTotalPhp: 148,
        },
      ],
      subtotalPhp: 148,
      deliveryFeePhp: 0,
      totalPhp: 148,
      status: 'received',
      createdAtIso: '2026-11-22T04:16:00.000Z',
      version: 1,
    };

    const firstSampleOrder = SAMPLE_ORDERS[0];
    if (!firstSampleOrder) {
      throw new Error('Expected sample order.');
    }

    const { state } = installMockShopApi({
      authenticated: true,
      role: 'cashier',
      initialOrders: [firstSampleOrder, dineInCashOrder],
    });
    render(
      <TestQueryWrapper>
        <AdminOrdersManager role="cashier" />
      </TestQueryWrapper>,
    );

    expect(await screen.findByText('Table 7')).toBeTruthy();
    expect(screen.getByRole('button', { name: /pending review \(1\)/i })).toBeTruthy();

    // Filter by Pending review -> shows only Marco Santos
    fireEvent.click(screen.getByRole('button', { name: /pending review \(1\)/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Marco Santos' })).toBeTruthy();
      expect(screen.queryByRole('heading', { level: 3, name: 'Tessa Lim' })).toBeNull();
    });

    // Reset payment filter to All payments and confirm payment on both GCash and Cash orders
    fireEvent.click(screen.getByRole('button', { name: /all payments/i }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Tessa Lim' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /mark #8b-104 paid/i }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Marked #8B-104 as paid.');
    });
    expect(state.orders.find((o) => o.queueNumber === '#8B-104')?.paymentStatus).toBe('paid');

    fireEvent.click(await screen.findByRole('button', { name: /revert #8b-104 to unpaid/i }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Reverted #8B-104 to unpaid.');
    });
    expect(state.orders.find((o) => o.queueNumber === '#8B-104')?.paymentStatus).toBe('unpaid');

    // Cashier can also pause orders
    const pauseButton = screen.getByRole('button', { name: /pause orders/i });
    fireEvent.click(pauseButton);
    await waitFor(() => {
      expect(state.store.acceptingOrders).toBe(false);
    });

    // Staff cannot pause orders or mark orders paid
    cleanup();
    vi.restoreAllMocks();
    installMockShopApi({
      authenticated: true,
      role: 'staff',
      initialOrders: [dineInCashOrder],
    });
    render(
      <TestQueryWrapper>
        <AdminOrdersManager role="staff" />
      </TestQueryWrapper>,
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Tessa Lim' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pause orders/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark #8b-104 paid/i })).toBeNull();
  });

  it('clears stale debounced search so typing after clearing never re-queries the old search term', async () => {
    installMockShopApi({ authenticated: true, initialOrders: SAMPLE_ORDERS });
    const requestedQueries: Array<string | null> = [];
    const fetchMock = vi.mocked(globalThis.fetch);
    const mockFetchImpl = fetchMock.getMockImplementation();
    expect(mockFetchImpl).toBeTruthy();
    if (!mockFetchImpl) return;
    fetchMock.mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/v1/admin/orders')) {
        const parsed = new URL(url, 'http://localhost');
        requestedQueries.push(parsed.searchParams.get('q'));
      }
      return mockFetchImpl(input, init);
    });

    render(
      <TestQueryWrapper>
        <AdminOrdersManager />
      </TestQueryWrapper>,
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Marco Santos' })).toBeTruthy();

    const searchInput = screen.getByLabelText(/search customer orders/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistent-old' } });
    expect(await screen.findByText('No orders match your current filter.')).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: '' } });
    expect(await screen.findByRole('heading', { level: 3, name: 'Marco Santos' })).toBeTruthy();

    requestedQueries.length = 0;
    fireEvent.change(searchInput, { target: { value: 'm' } });

    await waitFor(() => {
      expect(requestedQueries).toContain('m');
    });
    expect(requestedQueries).not.toContain('nonexistent-old');
  });
});

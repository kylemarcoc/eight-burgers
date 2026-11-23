import { DEFAULT_MENU_ITEMS } from '@menu-kiosk/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECEIPT_SESSION_STORAGE_KEY,
  resetCartStore,
  useCartActions,
  useCartOpen,
  useCartStore,
} from '@/shared/store/useCartStore';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { FloatingCartButton } from './FloatingCartButton';

const SEED_BURGER = DEFAULT_MENU_ITEMS[1];
if (!SEED_BURGER) {
  throw new Error('Expected Burger Deluxe seed item.');
}

function FloatingButtonHarness() {
  const { addToCart } = useCartActions();
  const isCartOpen = useCartOpen();
  return (
    <div>
      <button type="button" onClick={() => addToCart(SEED_BURGER)}>
        Seed Burger
      </button>
      <span data-testid="cart-open">{String(isCartOpen)}</span>
      <FloatingCartButton />
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCartStore();
  vi.restoreAllMocks();
});

describe('FloatingCartButton', () => {
  it('announces empty and populated cart totals and toggles cart open state', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <FloatingButtonHarness />
      </TestQueryWrapper>,
    );

    const emptyButton = screen.getByRole('button', { name: 'Open cart (empty)' });
    expect(emptyButton.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Seed Burger' }));
    const populatedButton = await screen.findByRole('button', {
      name: /open cart with 1 item, subtotal ₱148/i,
    });
    expect(populatedButton).toBeTruthy();

    fireEvent.click(populatedButton);
    await waitFor(() => {
      expect(populatedButton.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('cart-open').textContent).toBe('true');
    });
  });

  it('displays the tracked order queue number and live kitchen status when the cart is empty', async () => {
    installMockShopApi({
      initialOrders: [
        {
          id: '00000000-0000-4000-8000-000000000101',
          queueNumber: '#8B-101',
          customerName: 'Marco',
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
          status: 'preparing',
          createdAtIso: '2026-11-22T03:00:00.000Z',
          version: 2,
        },
      ],
    });

    useCartStore.getState().actions.setTrackedQueueNumber('#8B-101');
    render(
      <TestQueryWrapper>
        <FloatingButtonHarness />
      </TestQueryWrapper>,
    );

    expect(
      await screen.findByRole('button', {
        name: /open order tracker for #8b-101 \(on the grill\)/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText('Order #8B-101')).toBeTruthy();
    expect(screen.getByText('On the Grill')).toBeTruthy();
  });

  it('restores live status after reload from opaque sessionStorage receipt credentials', async () => {
    installMockShopApi({
      initialOrders: [
        {
          id: '00000000-0000-4000-8000-000000000109',
          queueNumber: '#8B-109',
          customerName: 'Dina',
          contactNumber: '',
          fulfillment: 'dine-in',
          tableNumber: '7',
          addressOrNotes: '',
          paymentMethod: 'gcash',
          paymentStatus: 'pending_verification',
          paymentReference: 'GC-9001',
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
          status: 'ready',
          createdAtIso: '2026-11-22T03:00:00.000Z',
          version: 2,
        },
      ],
    });

    window.sessionStorage.setItem(
      RECEIPT_SESSION_STORAGE_KEY,
      JSON.stringify({
        orderId: '00000000-0000-4000-8000-000000000109',
        queueNumber: '#8B-109',
        receiptToken: 'opaque-token-109',
      }),
    );
    useCartStore.getState().actions.rehydrateSessionStorage();

    render(
      <TestQueryWrapper>
        <FloatingButtonHarness />
      </TestQueryWrapper>,
    );

    expect(
      await screen.findByRole('button', {
        name: /open order tracker for #8b-109 \(ready\)/i,
      }),
    ).toBeTruthy();
  });
});

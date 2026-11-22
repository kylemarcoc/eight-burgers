import { DEFAULT_MENU_ITEMS } from '@eight-burgers/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
          status: 'grilling',
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
});

import { DEFAULT_MENU_ITEMS } from '@eight-burgers/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCartStore, useCartActions, useCartOpen } from '@/shared/store/useCartStore';
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
});

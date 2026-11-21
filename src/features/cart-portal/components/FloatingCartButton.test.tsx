import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShopProvider } from '@/shared/shop/ShopProvider';
import { useShop } from '@/shared/shop/shop-context';
import { FloatingCartButton } from './FloatingCartButton';

function FloatingButtonHarness() {
  const { addToCart, isCartOpen } = useShop();
  return (
    <div>
      <button type="button" onClick={() => addToCart('burger-deluxe')}>
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
});

describe('FloatingCartButton', () => {
  it('announces empty and populated cart totals and toggles cart open state', () => {
    render(
      <ShopProvider>
        <FloatingButtonHarness />
      </ShopProvider>,
    );

    const emptyButton = screen.getByRole('button', { name: 'Open cart (empty)' });
    expect(emptyButton.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Seed Burger' }));
    const populatedButton = screen.getByRole('button', {
      name: /open cart with 1 item, subtotal ₱148/i,
    });
    expect(populatedButton).toBeTruthy();

    fireEvent.click(populatedButton);
    expect(populatedButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('cart-open').textContent).toBe('true');
  });
});

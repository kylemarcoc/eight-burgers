import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@/shared/shop/types';
import { MenuCard } from './MenuCard';

const SAMPLE_BURGER: MenuItem = {
  id: 'burger-deluxe',
  name: 'Burger Deluxe',
  category: 'classic-burgers',
  pricePhp: 148,
  pattySpec: '100g Pure Beef',
  description: '100g pure beef patty with signature sauce.',
  imageUrl: '',
  available: true,
  featured: true,
  allowAddons: true,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MenuCard', () => {
  it('customizes and clears add-ons and passes selected add-on IDs to onAddToCart', () => {
    const onAddToCart = vi.fn();
    render(<MenuCard item={SAMPLE_BURGER} qtyInCart={0} onAddToCart={onAddToCart} />);

    fireEvent.click(screen.getByRole('button', { name: /customize add-ons/i }));
    fireEvent.click(screen.getByLabelText(/sliced cheese/i));
    fireEvent.click(screen.getByLabelText(/crispy bacon/i));

    const addButton = screen.getByRole('button', { name: /add · ₱188/i });
    fireEvent.click(addButton);

    expect(onAddToCart).toHaveBeenCalledWith('burger-deluxe', ['sliced-cheese', 'bacon']);

    fireEvent.click(screen.getByRole('button', { name: /clear add-ons/i }));
    expect(screen.getByRole('status').textContent).toContain('Added Burger Deluxe to cart.');
  });

  it('resets feedback state cleanly and clears timer on unmount', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const onAddToCart = vi.fn();

    const { unmount } = render(
      <MenuCard item={SAMPLE_BURGER} qtyInCart={1} onAddToCart={onAddToCart} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add · ₱148/i }));
    expect(screen.getByRole('button', { name: /added to cart/i })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByRole('button', { name: /add · ₱148/i })).toBeTruthy();

    // Trigger again and unmount before timer elapses
    fireEvent.click(screen.getByRole('button', { name: /add · ₱148/i }));
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('disables ordering and hides add-ons when sold out', () => {
    render(
      <MenuCard
        item={{ ...SAMPLE_BURGER, available: false }}
        qtyInCart={0}
        onAddToCart={vi.fn()}
      />,
    );

    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /customize add-ons/i })).toBeNull();
    const unavailableBtn = screen.getByRole('button', { name: /unavailable/i });
    expect((unavailableBtn as HTMLButtonElement).disabled).toBe(true);
  });
});

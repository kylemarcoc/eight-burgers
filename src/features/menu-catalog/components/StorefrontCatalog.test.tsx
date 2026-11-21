import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShopProvider } from '@/shared/shop/ShopProvider';
import { StorefrontCatalog } from './StorefrontCatalog';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('StorefrontCatalog', () => {
  it('supports keyboard tablist navigation and updates visible menu items', () => {
    render(
      <ShopProvider>
        <StorefrontCatalog />
      </ShopProvider>,
    );

    const allTab = screen.getByRole('tab', { name: /all menu/i });
    allTab.focus();

    fireEvent.keyDown(allTab, { key: 'ArrowRight' });
    const classicTab = screen.getByRole('tab', { name: /classic burgers/i });
    expect(classicTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(classicTab);
    expect(screen.queryByRole('heading', { level: 3, name: 'Crinkle Cut Fries' })).toBeNull();

    fireEvent.keyDown(classicTab, { key: 'End' });
    const sidesTab = screen.getByRole('tab', { name: /sides & snacks/i });
    expect(sidesTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { level: 3, name: 'Crinkle Cut Fries' })).toBeTruthy();

    fireEvent.keyDown(sidesTab, { key: 'Home' });
    expect(allTab.getAttribute('aria-selected')).toBe('true');
  });

  it('filters by search, clears search, and resets empty filters', () => {
    render(
      <ShopProvider>
        <StorefrontCatalog />
      </ShopProvider>,
    );

    const searchInput = screen.getByLabelText(/search menu items/i);
    fireEvent.change(searchInput, { target: { value: 'nachos' } });
    expect(screen.getByRole('heading', { level: 3, name: 'Nachos Overload' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /clear menu search/i }));
    expect((searchInput as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: 'nonexistent-item-xyz' } });
    expect(screen.getByText('No menu items match your filter.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /reset menu filters/i }));
    expect(screen.getByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeTruthy();
  });

  it('allows quick-adding featured highlights from the hero', () => {
    render(
      <ShopProvider>
        <StorefrontCatalog />
      </ShopProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /quick add burger deluxe/i }));
    expect(screen.getByRole('button', { name: /review order \(1 · ₱148\)/i })).toBeTruthy();
  });
});

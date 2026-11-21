import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetShopStore } from '@/shared/store/useShopStore';
import { StorefrontCatalog } from './StorefrontCatalog';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetShopStore();
});

describe('StorefrontCatalog', () => {
  it('supports keyboard tablist navigation and updates visible menu items', () => {
    render(<StorefrontCatalog />);

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
    render(<StorefrontCatalog />);

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

  it('prioritizes in-page ordering CTA and keeps Foodpanda and Facebook links subtle', () => {
    render(<StorefrontCatalog />);

    const orderLink = screen.getByRole('link', { name: /order from menu/i });
    expect(orderLink.getAttribute('href')).toBe('#menu-heading');

    const foodpandaLink = screen.getByRole('link', { name: 'Foodpanda' });
    const facebookLink = screen.getByRole('link', { name: 'Facebook' });
    expect(foodpandaLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(facebookLink.getAttribute('rel')).toBe('noopener noreferrer');

    fireEvent.click(screen.getByRole('button', { name: /quick add burger deluxe/i }));
    expect(screen.getByRole('button', { name: /review order \(1 · ₱148\)/i })).toBeTruthy();
  });

  it('loads the hero showcase image eagerly with high priority while keeping menu cards lazy', () => {
    render(<StorefrontCatalog />);

    const heroImage = screen.getByAltText('8Burgers Chino Roces Avenue signature burger showcase');
    expect(heroImage.getAttribute('loading')).toBe('eager');
    expect(heroImage.getAttribute('fetchpriority')).toBe('high');

    const cardImage = screen.getByAltText('Mini Cheese Burger Deluxe');
    expect(cardImage.getAttribute('loading')).toBe('lazy');
  });
});

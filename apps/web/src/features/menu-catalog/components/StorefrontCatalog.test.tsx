import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCartStore } from '@/shared/store/useCartStore';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { StorefrontCatalog } from './StorefrontCatalog';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetCartStore();
  vi.restoreAllMocks();
});

describe('StorefrontCatalog', () => {
  it('supports keyboard tablist navigation and updates visible menu items', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <StorefrontCatalog />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });
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

  it('filters by search, clears search, and resets empty filters', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <StorefrontCatalog />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });
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

  it('prioritizes in-page ordering CTA and renders store external links cleanly', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <StorefrontCatalog />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });
    const orderLink = screen.getByRole('link', { name: /order from menu/i });
    expect(orderLink.getAttribute('href')).toBe('#menu-heading');

    const foodpandaLink = screen.getByRole('link', { name: 'Foodpanda' });
    const facebookLink = screen.getByRole('link', { name: 'Facebook' });
    expect(foodpandaLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(facebookLink.getAttribute('rel')).toBe('noopener noreferrer');

    fireEvent.click(screen.getByRole('button', { name: /quick add burger deluxe/i }));
    expect(screen.getByRole('button', { name: /review order \(1 · ₱148\)/i })).toBeTruthy();
  });

  it('loads the hero showcase image eagerly with high priority while keeping menu cards lazy', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <StorefrontCatalog />
      </TestQueryWrapper>,
    );

    await screen.findByAltText('Mini Cheese Burger Deluxe');
    const heroImage = screen.getByAltText('8Burgers Chino Roces Avenue, Makati showcase');
    expect(heroImage.getAttribute('loading')).toBe('eager');
    expect(heroImage.getAttribute('fetchpriority')).toBe('high');
    expect(heroImage.getAttribute('decoding')).toBeNull();

    const cardImage = screen.getByAltText('Mini Cheese Burger Deluxe');
    expect(cardImage.getAttribute('loading')).toBe('lazy');
    expect(cardImage.getAttribute('decoding')).toBe('async');
  });

  it('renders a clean typographic hero fallback and paused banner while keeping bag building active', async () => {
    installMockShopApi({
      initialStore: {
        storeName: 'Kape Kanto',
        branchLabel: 'Cebu IT Park',
        monogram: 'KK',
        heroHeadline: 'Small-batch coffee brewed to order.',
        heroSubtext: 'Order ahead for counter pickup.',
        heroBadgeLabel: '',
        address: 'W. Geonzon St., Apas, Cebu City',
        landmark: '',
        pickupSpotLabel: 'IT Park Counter',
        heroImageUrl: '',
        externalLinks: [],
        acceptingOrders: false,
        closedNotice: 'Baristas are restocking — back at 2:00 PM.',
      },
    });

    render(
      <TestQueryWrapper>
        <StorefrontCatalog />
      </TestQueryWrapper>,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /small-batch coffee brewed to order\./i,
      }),
    ).toBeTruthy();
    expect(screen.getByText('Ordering is currently paused')).toBeTruthy();
    expect(screen.getByText('Baristas are restocking — back at 2:00 PM.')).toBeTruthy();
    expect(screen.getByText('KK')).toBeTruthy();
    expect(screen.queryByAltText(/showcase/i)).toBeNull();
    expect(screen.queryByText(/8burgers|chino roces/i)).toBeNull();

    // Customers can still browse and add items to their bag while paused
    fireEvent.click(screen.getByRole('button', { name: /quick add burger deluxe/i }));
    expect(screen.getByRole('button', { name: /review order \(1 · ₱148\)/i })).toBeTruthy();
  });

  it('distinguishes an empty menu catalog from an empty filter match', async () => {
    installMockShopApi({ initialMenu: [] });
    render(
      <TestQueryWrapper>
        <StorefrontCatalog />
      </TestQueryWrapper>,
    );

    expect(await screen.findByText('No menu items are currently listed.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reset menu filters/i })).toBeNull();
  });
});

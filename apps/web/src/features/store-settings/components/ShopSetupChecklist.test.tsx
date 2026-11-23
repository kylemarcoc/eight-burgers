import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { SETUP_CHECKLIST_DISMISSED_KEY, ShopSetupChecklist } from './ShopSetupChecklist';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('ShopSetupChecklist', () => {
  it('renders onboarding steps for a fresh shop with links and persists dismissal', async () => {
    installMockShopApi({
      authenticated: true,
      role: 'owner',
      initialStore: {
        storeName: 'Your Shop',
        address: '',
        originCoords: null,
        deliveryEnabled: false,
      },
      initialCategories: [],
      initialMenu: [],
    });

    const firstRender = render(
      <TestQueryWrapper>
        <MemoryRouter>
          <ShopSetupChecklist />
        </MemoryRouter>
      </TestQueryWrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: /finish setting up your shop/i }),
    ).toBeTruthy();
    expect(screen.getByText('0 of 2 core steps done')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open store settings/i }).getAttribute('href')).toBe(
      '/admin/settings',
    );
    expect(screen.getByRole('link', { name: /manage menu/i }).getAttribute('href')).toBe('/admin');
    expect(
      screen.getByRole('link', { name: /configure payments & qr/i }).getAttribute('href'),
    ).toBe('/admin/settings');
    expect(screen.getByRole('link', { name: /manage team/i }).getAttribute('href')).toBe(
      '/admin/team',
    );

    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    expect(screen.queryByRole('heading', { name: /finish setting up your shop/i })).toBeNull();
    expect(window.localStorage.getItem(SETUP_CHECKLIST_DISMISSED_KEY)).toBe('1');

    // Stays dismissed after re-mount
    firstRender.unmount();
    render(
      <TestQueryWrapper>
        <MemoryRouter>
          <ShopSetupChecklist />
        </MemoryRouter>
      </TestQueryWrapper>,
    );
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /finish setting up your shop/i })).toBeNull();
    });
  });

  it('stays hidden once store profile, origin pin, categories, and menu items are configured', async () => {
    installMockShopApi({ authenticated: true, role: 'owner' });

    render(
      <TestQueryWrapper>
        <MemoryRouter>
          <ShopSetupChecklist />
        </MemoryRouter>
      </TestQueryWrapper>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /finish setting up your shop/i })).toBeNull();
    });
  });
});

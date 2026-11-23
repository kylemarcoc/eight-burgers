import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCENT_STORAGE_KEY, ThemeProvider } from '@/app/providers/ThemeProvider';
import { resetCartStore, useCartStore } from '@/shared/store/useCartStore';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { KioskShell } from './KioskShell';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetCartStore();
  document.documentElement.classList.remove('dark');
  document.documentElement.dataset.uiTheme = 'light';
  document.documentElement.style.removeProperty('--ui-accent');
  document.documentElement.style.removeProperty('--ui-accent-hover');
  document.documentElement.style.removeProperty('--ui-on-accent');
  document.documentElement.style.removeProperty('--ui-focus-color');
  vi.restoreAllMocks();
});

function renderShell(initialPath: string) {
  return render(
    <ThemeProvider>
      <TestQueryWrapper>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<KioskShell />}>
              <Route index element={<div>Storefront</div>} />
              <Route path="/admin" element={<div>Admin Menu</div>} />
              <Route path="/admin/orders" element={<div>Admin Orders</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TestQueryWrapper>
    </ThemeProvider>,
  );
}

describe('KioskShell', () => {
  it('shows cart controls on storefront routes', () => {
    installMockShopApi();
    renderShell('/');

    expect(screen.getByRole('button', { name: /cart \(0\)/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /open cart/i })).toBeTruthy();
  });

  it('hides cart controls on /admin and /admin/orders routes', () => {
    installMockShopApi();
    renderShell('/admin');

    expect(screen.queryByRole('button', { name: /cart \(/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /open cart/i })).toBeNull();

    cleanup();
    renderShell('/admin/orders');

    expect(screen.queryByRole('button', { name: /cart \(/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /open cart/i })).toBeNull();
  });

  it('closes an open cart drawer when entering /admin routes', async () => {
    installMockShopApi();
    useCartStore.setState({ isCartOpen: true });

    renderShell('/admin');
    await waitFor(() => {
      expect(useCartStore.getState().isCartOpen).toBe(false);
    });
  });

  it('syncs header brand, document.title, favicon, and light/dark accent tokens from catalog.store', async () => {
    installMockShopApi({
      initialStore: {
        storeName: 'Kape Kanto',
        branchLabel: 'Cebu IT Park',
        monogram: 'KK',
        themeAccentPreset: 'matcha',
        themeAccentHex: null,
        logoUrl: '',
      },
    });

    renderShell('/');

    expect(await screen.findByText('Kape Kanto')).toBeTruthy();
    expect(screen.getByText('Cebu IT Park')).toBeTruthy();
    expect(screen.getByText('KK')).toBeTruthy();

    await waitFor(() => {
      expect(document.title).toBe('Kape Kanto — Cebu IT Park');
      expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#2f6b3c');
    });

    const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(iconLink?.href).toContain('KK');

    const storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    expect(storedAccent).toContain('#2f6b3c');
    expect(storedAccent).toContain('#7fd18b');

    fireEvent.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    await waitFor(() => {
      expect(document.documentElement.dataset.uiTheme).toBe('dark');
      expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#7fd18b');
    });
  });
});

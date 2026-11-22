import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { resetCartStore, useCartStore } from '@/shared/store/useCartStore';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { KioskShell } from './KioskShell';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetCartStore();
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
});

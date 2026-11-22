import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminLayout } from './AdminLayout';
import { AdminOrdersPage } from './AdminOrdersPage';
import { AdminPage } from './AdminPage';
import { AdminTeamPage } from './AdminTeamPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderAdminRoutes(initialPath: string) {
  return render(
    <TestQueryWrapper>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="team" element={<AdminTeamPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TestQueryWrapper>,
  );
}

describe('AdminLayout routes', () => {
  it('enforces auth across /admin and /admin/orders, switches tabs without re-auth, and signs out', async () => {
    installMockShopApi({ authenticated: false });
    renderAdminRoutes('/admin/orders');

    expect(
      await screen.findByRole('heading', { level: 1, name: /staff portal sign-in/i }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/staff email/i), {
      target: { value: 'owner@eightburgers.local' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'EightBurgersDev123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in to staff portal/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /^customer orders$/i }),
    ).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /menu & delivery/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /menu & delivery manager/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /customer orders/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /^customer orders$/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /team & roles/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^team & roles$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /staff portal sign-in/i }),
    ).toBeTruthy();
  });

  it('shows Cashier and Staff role badges, Menu Stock tab, and hides owner-only catalog/delivery/team controls', async () => {
    for (const account of [
      { email: 'cashier@eightburgers.local', label: 'Cashier' },
      { email: 'staff@eightburgers.local', label: 'Staff' },
    ]) {
      installMockShopApi({ authenticated: false });
      renderAdminRoutes('/admin');

      expect(
        await screen.findByRole('heading', { level: 1, name: /staff portal sign-in/i }),
      ).toBeTruthy();

      fireEvent.change(screen.getByLabelText(/staff email/i), {
        target: { value: account.email },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'EightBurgersDev123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /sign in to staff portal/i }));

      expect(
        await screen.findByRole('heading', { level: 1, name: /menu stock manager/i }),
      ).toBeTruthy();
      expect(screen.getByText(account.label)).toBeTruthy();
      expect(screen.getByRole('link', { name: /^menu stock$/i })).toBeTruthy();
      expect(screen.queryByRole('link', { name: /team & roles/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /add item to menu/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /restore default menu/i })).toBeNull();
      expect(screen.queryByRole('heading', { name: /delivery pricing/i })).toBeNull();

      fireEvent.click(screen.getByRole('link', { name: /customer orders/i }));
      expect(
        await screen.findByRole('heading', { level: 1, name: /^customer orders$/i }),
      ).toBeTruthy();

      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('blocks non-owners who navigate directly to /admin/team with an Owner access notice', async () => {
    installMockShopApi({ authenticated: true, role: 'cashier' });
    renderAdminRoutes('/admin/team');

    expect(
      await screen.findByRole('heading', { level: 1, name: /owner access required/i }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /go to menu stock/i })).toBeTruthy();
  });
});

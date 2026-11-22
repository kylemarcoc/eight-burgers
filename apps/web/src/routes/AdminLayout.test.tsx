import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminLayout } from './AdminLayout';
import { AdminOrdersPage } from './AdminOrdersPage';
import { AdminPage } from './AdminPage';

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
      await screen.findByRole('heading', { level: 1, name: /owner admin sign-in/i }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/admin email/i), {
      target: { value: 'owner@eightburgers.local' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'EightBurgersDev123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in to owner admin/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /^customer orders$/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /menu & delivery/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /menu & delivery manager/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: /customer orders/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /^customer orders$/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /owner admin sign-in/i }),
    ).toBeTruthy();
  });
});

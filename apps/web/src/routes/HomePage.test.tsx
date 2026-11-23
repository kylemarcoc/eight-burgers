import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DINE_IN_TABLE_STORAGE_KEY,
  resetCartStore,
  useCartStore,
} from '@/shared/store/useCartStore';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { HomePage } from './HomePage';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCartStore();
  vi.restoreAllMocks();
});

describe('HomePage dine-in table QR deep-link', () => {
  it('parses ?fulfillment=dine-in&table=7 when dine-in is enabled, persists in sessionStorage across reloads, and allows dismissal', async () => {
    installMockShopApi({
      initialStore: {
        dineInEnabled: true,
        dineInTableRequired: true,
      },
    });

    const firstRender = render(
      <TestQueryWrapper>
        <MemoryRouter initialEntries={['/?fulfillment=dine-in&table=7']}>
          <HomePage />
        </MemoryRouter>
      </TestQueryWrapper>,
    );

    expect(await screen.findByText('Ordering for Table 7')).toBeTruthy();
    expect(window.sessionStorage.getItem(DINE_IN_TABLE_STORAGE_KEY)).toBe('7');

    // Simulate reload to root URL without query params -> sessionStorage preserves the table banner
    firstRender.unmount();
    resetCartStore();
    useCartStore.getState().actions.rehydrateSessionStorage();

    render(
      <TestQueryWrapper>
        <MemoryRouter initialEntries={['/']}>
          <HomePage />
        </MemoryRouter>
      </TestQueryWrapper>,
    );

    expect(await screen.findByText('Ordering for Table 7')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    expect(screen.queryByText('Ordering for Table 7')).toBeNull();
    expect(window.sessionStorage.getItem(DINE_IN_TABLE_STORAGE_KEY)).toBeNull();
  });

  it('ignores table query params when dine-in is disabled', async () => {
    installMockShopApi({
      initialStore: {
        dineInEnabled: false,
      },
    });

    render(
      <TestQueryWrapper>
        <MemoryRouter initialEntries={['/?fulfillment=dine-in&table=7']}>
          <HomePage />
        </MemoryRouter>
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Ordering for Table 7')).toBeNull();
    expect(window.sessionStorage.getItem(DINE_IN_TABLE_STORAGE_KEY)).toBeNull();
  });
});

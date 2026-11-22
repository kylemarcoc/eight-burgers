import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuthGuard } from '@/features/admin-auth';
import { resetCartStore } from '@/shared/store/useCartStore';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminCatalogManager } from './AdminCatalogManager';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetCartStore();
  vi.restoreAllMocks();
});

describe('AdminCatalogManager', () => {
  it('validates fields with aria-invalid/aria-describedby and rejects unsafe image URLs', async () => {
    installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });
    const nameInput = screen.getByLabelText(/item name/i);
    const priceInput = screen.getByLabelText(/price \(₱\)/i);
    const descInput = screen.getByLabelText(/ingredients & description/i);
    const imageInput = screen.getByLabelText(/image url/i);

    fireEvent.change(priceInput, { target: { value: '0' } });
    fireEvent.change(imageInput, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: /add item to menu/i }));

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    expect(priceInput.getAttribute('aria-invalid')).toBe('true');
    expect(descInput.getAttribute('aria-invalid')).toBe('true');
    expect(imageInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/enter a valid https:\/\/ image url/i)).toBeTruthy();

    fireEvent.change(imageInput, { target: { value: 'http://example.com/burger.webp' } });
    fireEvent.click(screen.getByRole('button', { name: /add item to menu/i }));
    expect(imageInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(imageInput, {
      target: { value: 'https://user:pass@example.com/burger.webp' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add item to menu/i }));
    expect(imageInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(nameInput, { target: { value: 'Smoked Bacon Burger' } });
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
  });

  it('edits listings, requires confirmation before deleting, and resets empty filters', async () => {
    installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    const editButton = await screen.findByRole('button', {
      name: /edit mini cheese burger deluxe/i,
    });
    fireEvent.click(editButton);
    expect(screen.getByText('Editing')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/price \(₱\)/i), { target: { value: '165' } });
    fireEvent.click(screen.getByRole('button', { name: /save listing changes/i }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('₱165');
    });

    fireEvent.click(screen.getByRole('button', { name: /delete burger deluxe/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete burger deluxe/i }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Removed "Burger Deluxe"');
    });

    fireEvent.change(screen.getByLabelText(/filter menu listings/i), {
      target: { value: 'no-such-burger' },
    });
    expect(screen.getByText('No listings match your current filter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /reset listing filters/i }));
    expect(screen.getByRole('heading', { level: 3, name: 'Chicano Burger' })).toBeTruthy();
  });

  it('requires confirmation before restoring the default menu', async () => {
    installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /delete burger deluxe/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete burger deluxe/i }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /restore default menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm restore/i }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      'Restored the default 8Burgers Chino Roces menu.',
    );
  });

  it('configures free delivery threshold and manages delivery zones in the admin panel', async () => {
    installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });
    const minSubtotalInput = screen.getByLabelText(/min\. subtotal \(₱\)/i);
    fireEvent.change(minSubtotalInput, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save threshold/i }));
    expect(minSubtotalInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(minSubtotalInput, { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: /save threshold/i }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('₱600');
    });

    const zoneNameInput = screen.getByLabelText(/zone name/i);
    fireEvent.change(zoneNameInput, { target: { value: 'Circuit & Olympia' } });
    fireEvent.change(screen.getByLabelText(/covered areas/i), {
      target: { value: 'Circuit Mall, AP Reyes' },
    });
    fireEvent.change(screen.getByLabelText(/max distance \(km\)/i), { target: { value: '4.5' } });
    fireEvent.change(screen.getByLabelText(/delivery fee \(₱\)/i), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText(/estimated eta/i), { target: { value: '20–30 min' } });
    fireEvent.click(screen.getByRole('button', { name: /add delivery zone/i }));

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Circuit & Olympia' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /active — pause circuit & olympia/i }));
    expect(
      await screen.findByRole('button', { name: /paused — activate circuit & olympia/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /delete zone circuit & olympia/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete zone circuit & olympia/i }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Circuit & Olympia' })).toBeNull();
    });
  });

  it('enforces the Staff Portal login gate before showing Menu & Delivery Manager', async () => {
    installMockShopApi({ authenticated: false });
    render(
      <TestQueryWrapper>
        <AdminAuthGuard>
          <AdminCatalogManager />
        </AdminAuthGuard>
      </TestQueryWrapper>,
    );

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
      await screen.findByRole('heading', { level: 1, name: /menu & delivery manager/i }),
    ).toBeTruthy();
  });

  it('allows cashier and staff roles to toggle In Stock / Sold Out while hiding CRUD, reset, and delivery settings', async () => {
    for (const role of ['cashier', 'staff'] as const) {
      installMockShopApi({ authenticated: true, role });
      render(
        <TestQueryWrapper>
          <AdminCatalogManager role={role} />
        </TestQueryWrapper>,
      );

      expect(
        await screen.findByRole('heading', { level: 1, name: /menu stock manager/i }),
      ).toBeTruthy();
      expect(await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeTruthy();

      expect(screen.queryByRole('heading', { level: 2, name: /add new menu item/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /restore default menu/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /edit burger deluxe/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /delete burger deluxe/i })).toBeNull();
      expect(screen.queryByLabelText(/min\. subtotal \(₱\)/i)).toBeNull();

      const toggleButton = screen.getByRole('button', {
        name: /in stock — toggle burger deluxe/i,
      });
      fireEvent.click(toggleButton);
      expect(
        await screen.findByRole('button', { name: /sold out — toggle burger deluxe/i }),
      ).toBeTruthy();

      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('syncs editingVersion after toggling availability of the item currently being edited and recovers from 409 conflicts', async () => {
    const { state } = installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /edit burger deluxe/i }));
    fireEvent.click(screen.getByRole('button', { name: /in stock — toggle burger deluxe/i }));
    await screen.findByRole('button', { name: /sold out — toggle burger deluxe/i });

    // Saving immediately after toggling the same item should NOT hit a self-409 conflict
    fireEvent.change(screen.getByLabelText(/price \(₱\)/i), { target: { value: '155' } });
    fireEvent.click(screen.getByRole('button', { name: /save listing changes/i }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Updated "Burger Deluxe" (₱155).');
    });

    // Simulate an external concurrent edit causing a 409 conflict and recover via "Reload latest item"
    fireEvent.click(screen.getByRole('button', { name: /edit burger deluxe/i }));
    const target = state.menu.find((entry) => entry.id === 'burger-deluxe');
    if (target) {
      target.pricePhp = 175;
      target.version = (target.version ?? 1) + 5;
    }

    fireEvent.change(screen.getByLabelText(/price \(₱\)/i), { target: { value: '160' } });
    fireEvent.click(screen.getByRole('button', { name: /save listing changes/i }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('alert')
          .some((node) => node.textContent?.includes('Menu item was updated on another device.')),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /reload latest item/i }));
    await waitFor(() => {
      expect((screen.getByLabelText(/price \(₱\)/i) as HTMLInputElement).value).toBe('175');
    });
  });

  it('uploads a menu photo as WebP, validates file types, and cleans up abandoned uploads on cancel', async () => {
    const { state } = installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });
    const fileInput = screen.getByLabelText(/upload menu photo/i) as HTMLInputElement;

    // Rejects unsupported MIME type client-side without hitting API
    const badFile = new File(['<svg></svg>'], 'bad.svg', { type: 'image/svg+xml' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    expect(screen.getByText(/please select a jpg, png, webp, or avif image file/i)).toBeTruthy();
    expect(state.uploadedImages.size).toBe(0);

    // Uploads valid photo, populates imageUrl, and tracks stored object
    const validFile = new File([new Uint8Array([1, 2, 3])], 'burger.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect((screen.getByLabelText(/image url/i) as HTMLInputElement).value).toContain(
        '/storage/v1/object/public/menu-images/items/',
      );
    });
    expect(state.uploadedImages.size).toBe(1);
    expect(screen.getByText(/uploaded webp/i)).toBeTruthy();

    // Switching to edit another item cleans up the unsaved upload automatically
    fireEvent.click(screen.getByRole('button', { name: /edit burger deluxe/i }));
    await waitFor(() => {
      expect(state.uploadedImages.size).toBe(0);
    });
  });
});

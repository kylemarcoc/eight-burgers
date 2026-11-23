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

  it('validates and updates distance-formula delivery pricing, live preview, conflicts, and defaults reset in admin panel', async () => {
    const { state } = installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });

    const enabledCheckbox = screen.getByLabelText(/accepting delivery orders/i) as HTMLInputElement;
    const baseFeeInput = screen.getByLabelText(/base fee \(₱\)/i) as HTMLInputElement;
    const perKmInput = screen.getByLabelText(/per-km rate \(₱\/km\)/i) as HTMLInputElement;
    const maxDistInput = screen.getByLabelText(/max distance \(km\)/i) as HTMLInputElement;
    const minSubtotalInput = screen.getByLabelText(/min\. subtotal \(₱\)/i) as HTMLInputElement;
    const saveBtn = screen.getByRole('button', { name: /save delivery settings/i });

    // Validation bounds
    fireEvent.change(baseFeeInput, { target: { value: '-5' } });
    fireEvent.click(saveBtn);
    expect(baseFeeInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(baseFeeInput, { target: { value: '45' } });
    fireEvent.change(perKmInput, { target: { value: '-1' } });
    fireEvent.click(saveBtn);
    expect(perKmInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(perKmInput, { target: { value: '12' } });
    fireEvent.change(maxDistInput, { target: { value: '0.04' } });
    fireEvent.click(saveBtn);
    expect(maxDistInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(maxDistInput, { target: { value: '15' } });
    fireEvent.change(minSubtotalInput, { target: { value: '0' } });
    fireEvent.click(saveBtn);
    expect(minSubtotalInput.getAttribute('aria-invalid')).toBe('true');

    // Live formula preview reflects dirty inputs before saving
    expect(screen.getByText(/₱45 base \+ ₱12\/km · up to 15 km/i)).toBeTruthy();
    expect(screen.getByText(/₱165/)).toBeTruthy(); // 10 km -> 45 + 120 = 165
    expect(screen.getByText('Out of range')).toBeTruthy(); // 20 km > 15 km

    // Save valid formula pricing
    fireEvent.change(minSubtotalInput, { target: { value: '600' } });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Saved delivery pricing: ₱45 base + ₱12/km up to 15 km (Free delivery at ₱600+).',
      );
    });
    expect(state.deliveryPricing.baseFeePhp).toBe(45);
    expect(state.deliveryPricing.perKmRatePhp).toBe(12);
    expect(state.deliveryPricing.maxDistanceKm).toBe(15);
    expect(state.deliveryPricing.freeDeliveryMinSubtotalPhp).toBe(600);

    // Pausing delivery persists deliveryEnabled = false and shows Paused badge
    fireEvent.click(enabledCheckbox);
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Delivery paused.');
    });
    expect(screen.getByText('Paused')).toBeTruthy();

    // Simulate concurrent external update triggering 409 conflict and recover via "Reload latest settings"
    state.deliveryPricing.baseFeePhp = 55;
    state.deliveryPricing.version = (state.deliveryPricing.version ?? 1) + 5;
    fireEvent.change(baseFeeInput, { target: { value: '70' } });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('alert')
          .some((node) =>
            node.textContent?.includes('Delivery settings changed on another device.'),
          ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /reload latest settings/i }));
    await waitFor(() => {
      expect(baseFeeInput.value).toBe('55');
    });

    // Two-step Restore Defaults confirmation resets all formula values
    fireEvent.click(screen.getByRole('button', { name: /restore defaults/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm restore/i }));
    await waitFor(() => {
      expect(baseFeeInput.value).toBe('35');
      expect(perKmInput.value).toBe('10');
      expect(maxDistInput.value).toBe('25');
      expect(minSubtotalInput.value).toBe('500');
      expect(enabledCheckbox.checked).toBe(true);
    });
  });

  it('pauses and resumes delivery in AdminDeliverySettings without losing custom formula rates or free-delivery threshold', async () => {
    const { state } = installMockShopApi({ authenticated: true });
    render(
      <TestQueryWrapper>
        <AdminCatalogManager />
      </TestQueryWrapper>,
    );

    await screen.findByRole('heading', { level: 3, name: 'Burger Deluxe' });

    const enabledCheckbox = screen.getByLabelText(/accepting delivery orders/i) as HTMLInputElement;
    const baseFeeInput = screen.getByLabelText(/base fee \(₱\)/i) as HTMLInputElement;
    const perKmInput = screen.getByLabelText(/per-km rate \(₱\/km\)/i) as HTMLInputElement;
    const maxDistInput = screen.getByLabelText(/max distance \(km\)/i) as HTMLInputElement;
    const minSubtotalInput = screen.getByLabelText(/min\. subtotal \(₱\)/i) as HTMLInputElement;
    const saveBtn = screen.getByRole('button', { name: /save delivery settings/i });

    fireEvent.change(baseFeeInput, { target: { value: '50' } });
    fireEvent.change(perKmInput, { target: { value: '15' } });
    fireEvent.change(maxDistInput, { target: { value: '12' } });
    fireEvent.change(minSubtotalInput, { target: { value: '700' } });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Saved delivery pricing: ₱50 base + ₱15/km up to 12 km (Free delivery at ₱700+).',
      );
    });

    // Unchecking shows pause banner in live preview before saving
    fireEvent.click(enabledCheckbox);
    expect(
      screen.getByText(/delivery orders are currently paused in this configuration\./i),
    ).toBeTruthy();

    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Delivery paused. Only Kiosk Pickup orders will be accepted.',
      );
    });
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(state.deliveryPricing).toMatchObject({
      deliveryEnabled: false,
      baseFeePhp: 50,
      perKmRatePhp: 15,
      maxDistanceKm: 12,
      freeDeliveryMinSubtotalPhp: 700,
    });

    // Re-enabling preserves all custom rates and threshold
    fireEvent.click(enabledCheckbox);
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Saved delivery pricing: ₱50 base + ₱15/km up to 12 km (Free delivery at ₱700+).',
      );
    });
    expect(screen.getByText('Accepting delivery')).toBeTruthy();
    expect(
      screen.queryByText(/delivery orders are currently paused in this configuration\./i),
    ).toBeNull();
    expect(state.deliveryPricing).toMatchObject({
      deliveryEnabled: true,
      baseFeePhp: 50,
      perKmRatePhp: 15,
      maxDistanceKm: 12,
      freeDeliveryMinSubtotalPhp: 700,
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

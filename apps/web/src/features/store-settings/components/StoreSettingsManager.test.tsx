import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { StoreSettingsManager } from './StoreSettingsManager';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StoreSettingsManager', () => {
  it('updates store profile, validates external links, and recovers from 409 conflicts', async () => {
    const { state } = installMockShopApi({ authenticated: true, role: 'owner' });
    render(
      <TestQueryWrapper>
        <StoreSettingsManager />
      </TestQueryWrapper>,
    );

    const storeNameInput = (await screen.findByLabelText(/store name/i)) as HTMLInputElement;
    expect(storeNameInput.value).toBe('8Burgers');

    fireEvent.change(storeNameInput, { target: { value: 'Kape Kanto' } });
    fireEvent.change(screen.getByLabelText(/branch \/ location label/i), {
      target: { value: 'Cebu IT Park' },
    });
    fireEvent.change(screen.getByLabelText(/monogram/i), { target: { value: 'KK' } });
    fireEvent.change(screen.getByLabelText(/queue number prefix/i), { target: { value: 'KK' } });
    fireEvent.change(screen.getByLabelText(/preparing stage label/i), {
      target: { value: 'Brewing' },
    });

    // Reject insecure external link
    fireEvent.change(screen.getByLabelText(/external link 1 url/i), {
      target: { value: 'http://insecure.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save store profile/i }));
    expect(await screen.findByText(/external links must start with https:\/\//i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/external link 1 url/i), {
      target: { value: 'https://instagram.com/kapekanto' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save store profile/i }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('status')
          .some((node) => node.textContent?.includes('Saved store profile for Kape Kanto.')),
      ).toBe(true);
    });
    expect(state.store.storeName).toBe('Kape Kanto');
    expect(state.store.branchLabel).toBe('Cebu IT Park');
    expect(state.store.monogram).toBe('KK');
    expect(state.store.queuePrefix).toBe('KK');
    expect(state.store.preparingStageLabel).toBe('Brewing');

    // Simulate external concurrent edit -> 409 conflict & reload recovery
    state.store.storeName = 'Kape Kanto Express';
    state.store.version = (state.store.version ?? 1) + 5;
    fireEvent.change(storeNameInput, { target: { value: 'Stale Name' } });
    fireEvent.click(screen.getByRole('button', { name: /save store profile/i }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('alert')
          .some((node) => node.textContent?.includes('Store profile changed on another device.')),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /reload latest profile/i }));
    await waitFor(() => {
      expect(storeNameInput.value).toBe('Kape Kanto Express');
    });
  });

  it('uploads branding assets, switches theme accent presets/custom hex, and cleans up abandoned uploads', async () => {
    const { state } = installMockShopApi({ authenticated: true, role: 'owner' });
    render(
      <TestQueryWrapper>
        <StoreSettingsManager />
      </TestQueryWrapper>,
    );

    await screen.findByLabelText(/store name/i);

    const logoFileInput = screen.getByLabelText(/upload store logo/i);
    const logoFile = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    fireEvent.change(logoFileInput, { target: { files: [logoFile] } });

    await waitFor(() => {
      expect((screen.getByLabelText(/^store logo$/i) as HTMLInputElement).value).toContain(
        '/storage/v1/object/public/menu-images/branding/',
      );
    });
    expect(state.uploadedImages.size).toBe(1);

    // Select Matcha preset and verify live contrast preview updates
    fireEvent.click(screen.getByRole('button', { name: /matcha/i }));
    expect(screen.getByText(/#2f6b3c/i)).toBeTruthy();

    // Switch to custom hex and save
    fireEvent.click(screen.getByRole('button', { name: /custom hex/i }));
    fireEvent.change(screen.getByLabelText(/custom brand hex/i), {
      target: { value: '#1d4ed8' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save branding & theme/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Saved branding and theme settings.',
      );
    });
    expect(state.store.themeAccentPreset).toBe('custom');
    expect(state.store.themeAccentHex).toBe('#1d4ed8');
    expect(state.store.logoUrl).toContain('/branding/');

    // Upload a hero image and immediately clear it -> unsaved asset cleaned up
    const heroFileInput = screen.getByLabelText(/upload hero banner/i);
    const heroFile = new File([new Uint8Array([4, 5, 6])], 'hero.webp', { type: 'image/webp' });
    fireEvent.change(heroFileInput, { target: { files: [heroFile] } });

    await waitFor(() => {
      expect(state.uploadedImages.size).toBe(2);
    });

    const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
    const clearHeroButton = clearButtons[1];
    expect(clearHeroButton).toBeTruthy();
    if (clearHeroButton) {
      fireEvent.click(clearHeroButton);
    }
    await waitFor(() => {
      expect(state.uploadedImages.size).toBe(1);
    });
  });

  it('pauses and resumes incoming orders with a custom notice and saves the shop origin pin', async () => {
    const { state } = installMockShopApi({
      authenticated: true,
      role: 'owner',
      initialStore: { originCoords: null },
      initialDeliveryPricing: {
        deliveryEnabled: false,
        baseFeePhp: 35,
        perKmRatePhp: 10,
        maxDistanceKm: 25,
        freeDeliveryMinSubtotalPhp: 500,
        originCoords: null,
      },
      locationSuggestions: [
        {
          id: 'cebu-it-park',
          label: 'Cebu IT Park',
          secondaryLabel: 'Apas, Cebu City, Cebu',
          coordinates: { lat: 10.3304, lng: 123.9064 },
        },
      ],
    });

    render(
      <TestQueryWrapper>
        <StoreSettingsManager />
      </TestQueryWrapper>,
    );

    await screen.findByText('Not configured');

    // Pause incoming orders with a custom notice
    fireEvent.change(screen.getByLabelText(/paused notice/i), {
      target: { value: 'Back after afternoon prep at 3 PM.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /pause orders/i }));

    await waitFor(() => {
      expect(state.store.acceptingOrders).toBe(false);
    });
    expect(state.store.closedNotice).toBe('Back after afternoon prep at 3 PM.');
    expect(screen.getByRole('button', { name: /resume orders/i })).toBeTruthy();

    // Configure shop pin via address search
    const pinSearch = screen.getByRole('combobox', { name: /search philippine shop address/i });
    fireEvent.change(pinSearch, { target: { value: 'Cebu' } });
    fireEvent.click(await screen.findByRole('option', { name: /cebu it park/i }));

    fireEvent.click(screen.getByRole('button', { name: /save shop location pin/i }));
    await waitFor(() => {
      expect(state.store.originCoords).toEqual({ lat: 10.3304, lng: 123.9064 });
    });
    expect(state.deliveryPricing.originCoords).toEqual({ lat: 10.3304, lng: 123.9064 });
  });

  it('configures fulfillment modes, payment methods, and lossless payment QR uploads', async () => {
    const { state } = installMockShopApi({ authenticated: true, role: 'owner' });
    render(
      <TestQueryWrapper>
        <StoreSettingsManager />
      </TestQueryWrapper>,
    );

    await screen.findByLabelText(/store name/i);

    // Enable Dine-in and toggle Bank Transfer on
    const dineInCheckbox = screen.getByRole('checkbox', { name: /dine-in/i });
    fireEvent.click(dineInCheckbox);
    expect(screen.getByLabelText(/require table number for dine-in orders/i)).toBeTruthy();

    const bankTransferCheckbox = screen.getByRole('checkbox', { name: /bank transfer/i });
    fireEvent.click(bankTransferCheckbox);

    // Fill GCash account details and upload a payment QR image
    const gcashAccountInput = document.getElementById(
      'payment-account-number-gcash',
    ) as HTMLInputElement;
    expect(gcashAccountInput).toBeTruthy();
    fireEvent.change(gcashAccountInput, { target: { value: '0917 555 0101' } });

    const qrFileInput = screen.getByLabelText(/upload gcash qr code/i);
    const qrFile = new File([new Uint8Array([7, 8, 9])], 'gcash-qr.png', { type: 'image/png' });
    fireEvent.change(qrFileInput, { target: { files: [qrFile] } });

    await waitFor(() => {
      const gcashQrUrlInput = document.getElementById('payment-qr-url-gcash') as HTMLInputElement;
      expect(gcashQrUrlInput.value).toContain('/storage/v1/object/public/menu-images/payment-qr/');
    });
    expect(state.uploadedImages.size).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /save fulfillment & payments/i }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Saved fulfillment and payment settings.',
      );
    });

    expect(state.store.dineInEnabled).toBe(true);
    expect(state.store.paymentMethods.bank_transfer.enabled).toBe(true);
    expect(state.store.paymentMethods.gcash.accountNumber).toBe('0917 555 0101');
    expect(state.store.paymentMethods.gcash.qrImageUrl).toContain('/payment-qr/');
  });

  it('syncs updated store version once dirty edits in StoreProfileForm are reverted so subsequent saves avoid 409', async () => {
    const { state } = installMockShopApi({ authenticated: true, role: 'owner' });
    render(
      <TestQueryWrapper>
        <StoreSettingsManager />
      </TestQueryWrapper>,
    );

    const storeNameInput = (await screen.findByLabelText(/store name/i)) as HTMLInputElement;
    expect(storeNameInput.value).toBe('8Burgers');

    // Dirty StoreProfileForm
    fireEvent.change(storeNameInput, { target: { value: 'Temp Draft' } });

    // Save StoreBrandingThemeForm while StoreProfileForm is dirty -> bumps store.version
    fireEvent.click(screen.getByRole('button', { name: /matcha/i }));
    fireEvent.click(screen.getByRole('button', { name: /save branding & theme/i }));
    await waitFor(() => {
      expect(state.store.themeAccentPreset).toBe('matcha');
    });

    // Revert StoreProfileForm edit so isDirty returns to false -> version sync must catch up
    fireEvent.change(storeNameInput, { target: { value: '8Burgers' } });

    // Edit again and save -> must succeed without a spurious 409 conflict
    fireEvent.change(storeNameInput, { target: { value: '8Burgers Makati' } });
    fireEvent.click(screen.getByRole('button', { name: /save store profile/i }));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('status')
          .some((node) => node.textContent?.includes('Saved store profile for 8Burgers Makati.')),
      ).toBe(true);
    });
    expect(state.store.storeName).toBe('8Burgers Makati');
    expect(screen.queryByText(/store profile changed on another device/i)).toBeNull();
  });
});

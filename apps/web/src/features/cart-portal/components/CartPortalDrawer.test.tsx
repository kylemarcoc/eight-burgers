import { DEFAULT_DELIVERY_PRICING, DEFAULT_MENU_ITEMS } from '@menu-kiosk/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DINE_IN_TABLE_STORAGE_KEY,
  RECEIPT_SESSION_STORAGE_KEY,
  resetCartStore,
  useCartActions,
  useCartOpen,
  useCartStore,
} from '@/shared/store/useCartStore';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { CartPortalDrawer } from './CartPortalDrawer';

function CartDrawerTestHarness({ initialItemId = 'burger-deluxe' }: { initialItemId?: string }) {
  const { addToCart, setCartOpen } = useCartActions();
  const isCartOpen = useCartOpen();
  const seedItem =
    DEFAULT_MENU_ITEMS.find((entry) => entry.id === initialItemId) ?? DEFAULT_MENU_ITEMS[0];
  return (
    <div>
      <button type="button" onClick={() => seedItem && addToCart(seedItem)}>
        Add Seed Burger
      </button>
      <button type="button" onClick={() => setCartOpen(true)}>
        Open Drawer
      </button>
      <span data-testid="drawer-open-state">{String(isCartOpen)}</span>
      <CartPortalDrawer />
    </div>
  );
}

const ORIGINAL_GEOLOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCartStore();
  document.body.style.overflow = '';
  if (ORIGINAL_GEOLOCATION_DESCRIPTOR) {
    Object.defineProperty(navigator, 'geolocation', ORIGINAL_GEOLOCATION_DESCRIPTOR);
  } else {
    Reflect.deleteProperty(navigator, 'geolocation');
  }
  vi.restoreAllMocks();
});

function createGeolocationPosition(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

describe('CartPortalDrawer', () => {
  it('moves focus into the modal on open, traps Tab/Shift+Tab, and restores focus on Escape', () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    const openTrigger = screen.getByRole('button', { name: 'Open Drawer' });
    openTrigger.focus();
    fireEvent.click(openTrigger);

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    const closeBtn = within(dialog).getByRole('button', { name: /close cart drawer/i });
    const browseBtn = within(dialog).getByRole('button', { name: /browse menu/i });
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(browseBtn);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(openTrigger);
  });

  it('requires confirmation before clearing the cart', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    fireEvent.click(within(dialog).getByRole('button', { name: /clear cart/i }));

    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(within(dialog).getByText('Burger Deluxe')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /clear cart/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm clear/i }));
    expect(within(dialog).getByText('Your cart is empty.')).toBeTruthy();
  });

  it('wires validation errors with aria-invalid/aria-describedby, focuses address search when pin is missing, and preserves input', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    const nameInput = within(dialog).getByLabelText(/your name/i);

    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));
    expect(within(dialog).queryByLabelText(/delivery area/i)).toBeNull();
    const locationInput = await within(dialog).findByRole('combobox', {
      name: /delivery address/i,
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order/i }));

    await waitFor(() => {
      expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    });
    const nameErrorId = nameInput.getAttribute('aria-describedby');
    expect(nameErrorId).toBeTruthy();
    expect(document.getElementById(nameErrorId ?? '')?.textContent).toContain('Enter your name');

    const contactInput = within(dialog).getByLabelText(/mobile number/i);
    const notesInput = within(dialog).getByLabelText(/street, building & rider notes/i);
    expect(contactInput.getAttribute('aria-invalid')).toBe('true');
    expect(locationInput.getAttribute('aria-invalid')).toBe('true');
    expect(notesInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(nameInput, { target: { value: 'Marco' } });
    fireEvent.change(contactInput, { target: { value: '09171234567' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order/i }));
    await waitFor(() => {
      expect(document.activeElement).toBe(locationInput);
    });

    fireEvent.click(within(dialog).getByRole('radio', { name: /pickup/i }));
    expect(within(dialog).queryByText(/select a delivery address/i)).toBeNull();
    expect((nameInput as HTMLInputElement).value).toBe('Marco');
  });

  it('places a GPS delivery order via "Use my location", resolves address via BFF, copies summary with Google Maps link, and dismisses receipt cleanly', async () => {
    installMockShopApi();

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(createGeolocationPosition(14.5608, 121.0124));
        }),
      },
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    fireEvent.change(within(dialog).getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));
    fireEvent.change(within(dialog).getByLabelText(/mobile number/i), {
      target: { value: '09171234567' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: /^use my location$/i }));

    const locationInput = within(dialog).getByRole('combobox', {
      name: /delivery address/i,
    }) as HTMLInputElement;
    await waitFor(() => {
      expect(locationInput.value).toBe('Chino Roces Avenue, San Antonio, Makati');
    });

    const riderNotesInput = within(dialog).getByLabelText(
      /building, unit & rider notes \(optional\)/i,
    );
    fireEvent.change(riderNotesInput, { target: { value: 'Unit 402' } });

    fireEvent.change(within(dialog).getByLabelText(/payment method/i), {
      target: { value: 'gcash' },
    });
    // Non-cash orders require a payment reference at checkout before submitting
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱183/i }));
    expect(
      await within(dialog).findByText(
        /enter the payment reference number from your transfer receipt/i,
      ),
    ).toBeTruthy();
    const checkoutRefInput = within(dialog).getByLabelText(/^payment reference$/i);
    expect(document.activeElement).toBe(checkoutRefInput);

    fireEvent.change(checkoutRefInput, { target: { value: 'GC-1010' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱183/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('#8B-101')).toBeTruthy();
    expect(
      within(dialog).getByText(/unit 402 — chino roces avenue, san antonio, makati/i),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/^zone:/i)).toBeNull();
    expect(within(dialog).getByText(/^gcash payment details$/i)).toBeTruthy();
    expect(within(dialog).getByLabelText(/update payment reference/i)).toBeTruthy();
    const mapLink = within(dialog).getByRole('link', { name: /open in google maps/i });
    expect(mapLink.getAttribute('href')).toContain('https://maps.google.com/?q=14.56080,121.01240');

    fireEvent.click(within(dialog).getByRole('button', { name: /copy order summary/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
      expect(within(dialog).getByRole('button', { name: /order summary copied/i })).toBeTruthy();
    });
    expect(writeText.mock.calls[0]?.[0]).toContain('8Burgers Order #8B-101');
    expect(writeText.mock.calls[0]?.[0]).toContain('Total Due: ₱183');

    fireEvent.click(within(dialog).getByRole('button', { name: /^back to menu$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Active receipt session stays intact when returning to menu, so reopening still shows Order Confirmed
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));
    const reopenedDialog = screen.getByRole('dialog', { name: /your order cart/i });
    expect(await within(reopenedDialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(reopenedDialog).getByText('GC-1010')).toBeTruthy();
  });

  it('quotes fees dynamically from searched address, blocks out-of-range locations with recovery, unlocks free delivery, and requires manual address when GPS reverse lookup is null', async () => {
    installMockShopApi({
      onLocationReverse: () =>
        new Response(JSON.stringify({ data: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(createGeolocationPosition(14.5547, 121.0244));
        }),
      },
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness initialItemId="overload-burger" />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Overload Burger');
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));

    // GPS with null reverse label keeps pin (Makati CBD 1.9 km -> ₱54 fee -> ₱352 total), requires manual street/building input
    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Mia' } });
    fireEvent.change(within(dialog).getByLabelText(/mobile number/i), {
      target: { value: '09171234567' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^use my location$/i }));
    await waitFor(() => {
      expect(within(dialog).getByText('Device location')).toBeTruthy();
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱352/i }));
    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(dialog).getByLabelText(/street, building & rider notes/i),
      );
    });

    // Clear GPS and search Bonifacio High Street (5.5 km -> ₱90 fee -> ₱388 total)
    fireEvent.click(within(dialog).getByRole('button', { name: /^change$/i }));
    const locationInput = within(dialog).getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(locationInput, { target: { value: 'Bonifacio' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /bonifacio high street/i }));
    expect(within(dialog).getByRole('button', { name: /place order · ₱388/i })).toBeTruthy();
    expect(within(dialog).getByText(/estimated delivery · 25–35 min/i)).toBeTruthy();
    expect(
      within(dialog).getByText(/~5\.5 km from chino roces avenue, makati · ₱35 base \+ ₱10\/km/i),
    ).toBeTruthy();

    // Search out-of-range Tagaytay and recover via "Search another address"
    fireEvent.change(locationInput, { target: { value: 'Tagaytay' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /tagaytay rotonda/i }));
    expect(await within(dialog).findByText('Outside delivery area')).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: /place order/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: /search another address/i }));
    expect(within(dialog).queryByText('Outside delivery area')).toBeNull();
    expect(document.activeElement).toBe(locationInput);

    // Search Filinvest Alabang (21.2 km -> ₱247 fee -> ₱545 total) then unlock free delivery above ₱500
    fireEvent.change(locationInput, { target: { value: 'Alabang' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /filinvest city alabang/i }));
    expect(within(dialog).getByRole('button', { name: /place order · ₱545/i })).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole('button', { name: /increase quantity of overload burger/i }),
    );
    expect(within(dialog).getByText(/free delivery unlocked/i)).toBeTruthy();
    expect(within(dialog).getByText('₱247')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /place order · ₱596/i })).toBeTruthy();

    // Submit using selectedAddress without requiring duplicate manual address entry
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱596/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText(/filinvest city alabang, alabang, muntinlupa/i)).toBeTruthy();
    expect(within(dialog).queryByText(/^zone:/i)).toBeNull();
    expect(within(dialog).getByText('Free (min. met)')).toBeTruthy();
  });

  it('hides disabled fulfillment modes when delivery is disabled and allows pickup checkout', async () => {
    installMockShopApi({
      initialDeliveryPricing: {
        ...DEFAULT_DELIVERY_PRICING,
        deliveryEnabled: false,
      },
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness initialItemId="overload-burger" />
      </TestQueryWrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Overload Burger');
    expect(within(dialog).queryByRole('radio', { name: /delivery/i })).toBeNull();
    expect(within(dialog).getByRole('radio', { name: /pickup/i })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Marco' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱596/i }));
    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('Chino Roces Pickup')).toBeTruthy();
  });

  it('auto-prunes deleted menu items with a notice and keeps checkout enabled for remaining items', async () => {
    installMockShopApi({
      initialMenu: DEFAULT_MENU_ITEMS.filter((item) => item.id !== 'chicano-burger'),
    });
    useCartStore.setState({
      cart: [
        {
          lineId: 'chicano-burger',
          itemId: 'chicano-burger',
          quantity: 1,
          selectedOptionIds: [],
          itemNote: '',
        },
        {
          lineId: 'burger-deluxe',
          itemId: 'burger-deluxe',
          quantity: 1,
          selectedOptionIds: [],
          itemNote: '',
        },
      ],
      isCartOpen: true,
    });

    render(
      <TestQueryWrapper>
        <CartPortalDrawer />
      </TestQueryWrapper>,
    );

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    expect(await within(dialog).findByText('Burger Deluxe')).toBeTruthy();
    expect(
      await within(dialog).findByText(
        /removed 1 item from your bag that is no longer on the menu/i,
      ),
    ).toBeTruthy();
    expect(useCartStore.getState().cart.map((line) => line.itemId)).toEqual(['burger-deluxe']);
    expect(
      (within(dialog).getByRole('button', { name: /place order/i }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('shows a retryable error instead of empty cart when catalog fails to load for a saved bag', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Catalog offline' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    useCartStore.setState({
      cart: [
        {
          lineId: 'burger-deluxe',
          itemId: 'burger-deluxe',
          quantity: 2,
          selectedOptionIds: [],
          itemNote: '',
        },
      ],
      isCartOpen: true,
    });

    render(
      <TestQueryWrapper>
        <CartPortalDrawer />
      </TestQueryWrapper>,
    );

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    expect(
      await within(dialog).findByText(/unable to load menu details for your saved bag/i),
    ).toBeTruthy();
    expect(within(dialog).queryByText('Your cart is empty.')).toBeNull();
    expect(within(dialog).getByRole('button', { name: /retry loading menu/i })).toBeTruthy();
  });

  it('disables the quantity increase button at the 50-item cap', async () => {
    installMockShopApi();
    useCartStore.setState({
      cart: [
        {
          lineId: 'burger-deluxe',
          itemId: 'burger-deluxe',
          quantity: 50,
          selectedOptionIds: [],
          itemNote: '',
        },
      ],
      isCartOpen: true,
    });

    render(
      <TestQueryWrapper>
        <CartPortalDrawer />
      </TestQueryWrapper>,
    );

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    const increaseBtn = within(dialog).getByRole('button', {
      name: /increase quantity of burger deluxe/i,
    }) as HTMLButtonElement;
    expect(increaseBtn.disabled).toBe(true);
    expect(within(dialog).getByText('Max 50')).toBeTruthy();
  });

  it('renders the 4-stage live kitchen progress tracker and supports Tier 1 same-session order cancellation', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    fireEvent.change(within(dialog).getByLabelText(/your name/i), {
      target: { value: 'Marco' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱148/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    const progressList = within(dialog).getByRole('list', { name: /live kitchen progress/i });
    expect(within(progressList).getByText('Order Received')).toBeTruthy();
    expect(within(progressList).getByText('On the Grill')).toBeTruthy();
    expect(within(progressList).getByText('Ready at Counter')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel order$/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm cancel/i }));

    expect(
      await within(dialog).findByText(
        /this order was cancelled and removed from the active kitchen queue/i,
      ),
    ).toBeTruthy();
  });

  it('tracks an order by queue number on any device and supports Tier 2 verified cancellation', async () => {
    installMockShopApi({
      initialOrders: [
        {
          id: '00000000-0000-4000-8000-000000000105',
          queueNumber: '#8B-105',
          customerName: 'Carla',
          contactNumber: '09171234567',
          fulfillment: 'delivery',
          tableNumber: '',
          deliveryEtaMinutes: '20–30 min',
          addressOrNotes: 'Ayala Ave',
          paymentMethod: 'gcash',
          paymentStatus: 'unpaid',
          paymentReference: '',
          lines: [
            {
              lineId: 'burger-deluxe',
              itemId: 'burger-deluxe',
              name: 'Burger Deluxe',
              unitPricePhp: 148,
              selectedOptions: [],
              addonNames: [],
              itemNote: 'Secret private note',
              addonsPricePhp: 0,
              quantity: 1,
              lineTotalPhp: 148,
            },
          ],
          subtotalPhp: 148,
          deliveryFeePhp: 45,
          totalPhp: 193,
          status: 'received',
          createdAtIso: '2026-11-22T03:00:00.000Z',
          version: 1,
        },
      ],
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));
    const dialog = screen.getByRole('dialog', { name: /your order cart/i });

    fireEvent.change(within(dialog).getByLabelText(/track an existing order/i), {
      target: { value: '105' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /track order/i }));

    expect(await within(dialog).findByText('#8B-105')).toBeTruthy();
    expect(within(dialog).getByText('Live Order Tracker')).toBeTruthy();
    expect(within(dialog).getByText(/estimated delivery:/i)).toBeTruthy();
    expect(within(dialog).queryByText(/^zone:/i)).toBeNull();
    expect(within(dialog).queryByText('Carla')).toBeNull();
    expect(within(dialog).queryByText('Ayala Ave')).toBeNull();
    expect(within(dialog).queryByText(/secret private note/i)).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel order$/i }));
    const verifyInput = within(dialog).getByLabelText(/confirm mobile number on order/i);

    fireEvent.change(verifyInput, { target: { value: '09990000000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm cancel/i }));
    expect(
      await within(dialog).findByText(/verification details entered do not match this order/i),
    ).toBeTruthy();

    fireEvent.change(verifyInput, { target: { value: '+63 917 123 4567' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm cancel/i }));
    expect(
      await within(dialog).findByText(
        /this order was cancelled and removed from the active kitchen queue/i,
      ),
    ).toBeTruthy();
  });

  it('requires mobile number for pickup tracker cancellation and guides no-phone orders to device receipt or counter', async () => {
    installMockShopApi({
      initialOrders: [
        {
          id: '00000000-0000-4000-8000-000000000106',
          queueNumber: '#8B-106',
          customerName: 'Ana',
          contactNumber: '',
          fulfillment: 'pickup',
          tableNumber: '',
          deliveryEtaMinutes: '',
          addressOrNotes: '',
          paymentMethod: 'cash',
          paymentStatus: 'unpaid',
          paymentReference: '',
          lines: [
            {
              lineId: 'burger-deluxe',
              itemId: 'burger-deluxe',
              name: 'Burger Deluxe',
              unitPricePhp: 148,
              selectedOptions: [],
              addonNames: [],
              itemNote: '',
              addonsPricePhp: 0,
              quantity: 1,
              lineTotalPhp: 148,
            },
          ],
          subtotalPhp: 148,
          deliveryFeePhp: 0,
          totalPhp: 148,
          status: 'received',
          createdAtIso: '2026-11-22T03:00:00.000Z',
          version: 1,
        },
        {
          id: '00000000-0000-4000-8000-000000000107',
          queueNumber: '#8B-107',
          customerName: 'Ben',
          contactNumber: '09181112233',
          fulfillment: 'pickup',
          tableNumber: '',
          deliveryEtaMinutes: '',
          addressOrNotes: '',
          paymentMethod: 'cash',
          paymentStatus: 'unpaid',
          paymentReference: '',
          lines: [
            {
              lineId: 'burger-deluxe',
              itemId: 'burger-deluxe',
              name: 'Burger Deluxe',
              unitPricePhp: 148,
              selectedOptions: [],
              addonNames: [],
              itemNote: '',
              addonsPricePhp: 0,
              quantity: 1,
              lineTotalPhp: 148,
            },
          ],
          subtotalPhp: 148,
          deliveryFeePhp: 0,
          totalPhp: 148,
          status: 'received',
          createdAtIso: '2026-11-22T03:05:00.000Z',
          version: 1,
        },
      ],
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));
    const dialog = screen.getByRole('dialog', { name: /your order cart/i });

    fireEvent.change(within(dialog).getByLabelText(/track an existing order/i), {
      target: { value: '106' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /track order/i }));

    expect(await within(dialog).findByText('#8B-106')).toBeTruthy();
    expect(within(dialog).getByText(/this order was placed without a mobile number/i)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /^cancel order$/i })).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: /done · back to menu/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const nextDialog = screen.getByRole('dialog', { name: /your order cart/i });
    fireEvent.change(within(nextDialog).getByLabelText(/track an existing order/i), {
      target: { value: '107' },
    });
    fireEvent.click(within(nextDialog).getByRole('button', { name: /track order/i }));

    expect(await within(nextDialog).findByText('#8B-107')).toBeTruthy();
    fireEvent.click(within(nextDialog).getByRole('button', { name: /^cancel order$/i }));
    const verifyInput = within(nextDialog).getByLabelText(/confirm mobile number on order/i);
    fireEvent.change(verifyInput, { target: { value: '+63 918 111 2233' } });
    fireEvent.click(within(nextDialog).getByRole('button', { name: /confirm cancel/i }));
    expect(
      await within(nextDialog).findByText(
        /this order was cancelled and removed from the active kitchen queue/i,
      ),
    ).toBeTruthy();
  });

  it('closes the suggestion listbox on first Escape without closing the drawer, then closes drawer on second Escape', async () => {
    installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));

    const locationInput = within(dialog).getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(locationInput, { target: { value: 'Ayala' } });
    expect(await within(dialog).findByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(locationInput, { key: 'Escape' });
    expect(within(dialog).queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('dialog', { name: /your order cart/i })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clears a locked pin if the customer edits the address search text and blocks stale submission', async () => {
    const { spy } = installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness initialItemId="overload-burger" />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Overload Burger');
    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Mia' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));
    fireEvent.change(within(dialog).getByLabelText(/mobile number/i), {
      target: { value: '09171234567' },
    });

    const locationInput = within(dialog).getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(locationInput, { target: { value: 'Alabang' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /filinvest city alabang/i }));
    expect(within(dialog).getByRole('button', { name: /place order · ₱545/i })).toBeTruthy();

    // Editing the input clears the locked pin immediately so stale coordinates cannot be billed
    fireEvent.change(locationInput, { target: { value: 'Alabang Town' } });
    expect(within(dialog).getByText('Enter address')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /place order · ₱298/i })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱298/i }));
    expect(
      await within(dialog).findByText(
        /select a delivery address from the suggestions or use your device location/i,
      ),
    ).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(locationInput);
    });

    const orderPosts = spy.mock.calls.filter(
      ([input, init]) => String(input) === '/api/v1/orders' && init?.method === 'POST',
    );
    expect(orderPosts).toHaveLength(0);
  });

  it('omits deliveryZoneId, clamps composed addressOrNotes to 500 chars, and resets delivery state for the next order', async () => {
    const { spy, state } = installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Alex' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));
    fireEvent.change(within(dialog).getByLabelText(/mobile number/i), {
      target: { value: '09171234567' },
    });

    const locationInput = within(dialog).getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(locationInput, { target: { value: 'Ayala' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /ayala triangle gardens/i }));

    const longNotes = `Tower 1 ${'B'.repeat(490)}`;
    fireEvent.change(within(dialog).getByLabelText(/building, unit & rider notes/i), {
      target: { value: longNotes },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱200/i }));
    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();

    const orderPost = spy.mock.calls.find(
      ([input, init]) => String(input) === '/api/v1/orders' && init?.method === 'POST',
    );
    expect(orderPost).toBeTruthy();
    const sentPayload = JSON.parse(String(orderPost?.[1]?.body ?? '{}')) as Record<string, unknown>;
    expect('deliveryZoneId' in sentPayload).toBe(false);
    expect(sentPayload.deliveryPin).toEqual({ lat: 14.5572, lng: 121.0236 });
    expect(typeof sentPayload.addressOrNotes).toBe('string');
    expect((sentPayload.addressOrNotes as string).length).toBeLessThanOrEqual(500);

    // Wait for initial receipt sync to settle, then mark completed to dismiss receipt and verify delivery state was reset
    const refreshBtn = await within(dialog).findByRole('button', { name: /refresh status/i });
    await waitFor(() => {
      expect((refreshBtn as HTMLButtonElement).disabled).toBe(false);
    });
    if (state.orders[0]) {
      state.orders[0] = { ...state.orders[0], status: 'completed', version: 2 };
    }
    fireEvent.click(refreshBtn);
    await within(dialog).findByText('Completed');

    // Dismiss completed receipt and start a fresh order -> delivery state must be reset
    fireEvent.click(within(dialog).getByRole('button', { name: /done · back to menu/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const nextDialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(nextDialog).findByText('Burger Deluxe');
    fireEvent.click(within(nextDialog).getByRole('radio', { name: /delivery/i }));

    const nextLocationInput = within(nextDialog).getByRole('combobox', {
      name: /delivery address/i,
    }) as HTMLInputElement;
    const nextNotesInput = within(nextDialog).getByLabelText(
      /street, building & rider notes/i,
    ) as HTMLInputElement;
    expect(nextLocationInput.value).toBe('');
    expect(nextNotesInput.value).toBe('');
    expect(within(nextDialog).getByText('Enter address')).toBeTruthy();
  });

  it('handles mid-checkout delivery pause (422 DELIVERY_UNAVAILABLE), refreshes catalog to paused state, preserves form inputs, and recovers via Switch to Chino Roces Pickup', async () => {
    const { state } = installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');

    const nameInput = within(dialog).getByLabelText(/your name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Marco' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));
    const mobileInput = within(dialog).getByLabelText(/mobile number/i) as HTMLInputElement;
    fireEvent.change(mobileInput, { target: { value: '09171234567' } });

    const locationInput = within(dialog).getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(locationInput, { target: { value: 'Ayala' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /ayala triangle gardens/i }));
    const buyDeliveryBtn = within(dialog).getByRole('button', {
      name: /place order · ₱200/i,
    }) as HTMLButtonElement;
    expect(buyDeliveryBtn.disabled).toBe(false);

    // Owner pauses delivery while customer already has Delivery selected
    state.deliveryPricing.deliveryEnabled = false;
    state.store.deliveryEnabled = false;
    state.deliveryPricing.version = (state.deliveryPricing.version ?? 1) + 1;

    fireEvent.click(buyDeliveryBtn);

    expect(
      await within(dialog).findByText(
        /delivery is currently paused\. switch to pickup to continue\./i,
      ),
    ).toBeTruthy();
    expect(
      await within(dialog).findByText(
        /delivery is temporarily paused\. switch to chino roces pickup to place your order\./i,
      ),
    ).toBeTruthy();

    expect(
      (within(dialog).getByRole('radio', { name: /delivery/i }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(within(dialog).getAllByText('Paused')).toHaveLength(2);
    expect(within(dialog).queryByText('Enter address')).toBeNull();
    expect(
      (within(dialog).getByRole('button', { name: /place order/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(nameInput.value).toBe('Marco');
    expect(mobileInput.value).toBe('09171234567');

    fireEvent.click(within(dialog).getByRole('button', { name: /switch to chino roces pickup/i }));

    expect(
      (within(dialog).getByRole('radio', { name: /pickup/i }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(within(dialog).queryByText(/delivery is currently paused\./i)).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱148/i }));
    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('#8B-101')).toBeTruthy();
    expect(within(dialog).getByText('Chino Roces Pickup')).toBeTruthy();
  });

  it('keeps bag editing active while store is paused and disables only Place Order', async () => {
    installMockShopApi({
      initialStore: {
        acceptingOrders: false,
        closedNotice: 'Kitchen is catching up — reopening at 6 PM.',
      },
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    expect(within(dialog).getByText('Ordering is currently paused')).toBeTruthy();
    expect(within(dialog).getByText('Kitchen is catching up — reopening at 6 PM.')).toBeTruthy();

    // Quantity increase remains active while paused
    fireEvent.click(
      within(dialog).getByRole('button', { name: /increase quantity of burger deluxe/i }),
    );
    const placeOrderBtn = within(dialog).getByRole('button', {
      name: /place order · ₱296/i,
    }) as HTMLButtonElement;
    expect(placeOrderBtn.disabled).toBe(true);
  });

  it('keeps cart lines with sold-out options visible with inline Edit options repair and blocks checkout until resolved', async () => {
    installMockShopApi({
      initialOptionGroups: [
        {
          id: 'add-ons',
          name: 'Add-ons',
          description: '',
          selectionMode: 'multi',
          required: false,
          minSelect: 0,
          maxSelect: null,
          sortOrder: 1,
          active: true,
          choices: [
            {
              id: 'bacon',
              groupId: 'add-ons',
              name: 'Crispy Bacon',
              priceDeltaPhp: 20,
              available: false,
              isDefault: false,
              sortOrder: 1,
            },
            {
              id: 'sliced-cheese',
              groupId: 'add-ons',
              name: 'Sliced Cheese',
              priceDeltaPhp: 20,
              available: true,
              isDefault: false,
              sortOrder: 2,
            },
          ],
        },
      ],
    });

    useCartStore.setState({
      cart: [
        {
          lineId: 'burger-deluxe__bacon',
          itemId: 'burger-deluxe',
          quantity: 1,
          selectedOptionIds: ['bacon'],
          itemNote: 'Well done',
        },
      ],
      isCartOpen: true,
    });

    render(
      <TestQueryWrapper>
        <CartPortalDrawer />
      </TestQueryWrapper>,
    );

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    expect(await within(dialog).findByText('Options need attention')).toBeTruthy();
    expect(within(dialog).getByText(/"crispy bacon" is currently sold out\./i)).toBeTruthy();
    expect(within(dialog).getByText('Note: Well done')).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: /place order/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    // Open inline Edit options repair modal prefilled
    fireEvent.click(
      within(dialog).getByRole('button', { name: /edit options for burger deluxe/i }),
    );
    const customizer = await screen.findByRole('dialog', { name: 'Burger Deluxe' });
    fireEvent.click(within(customizer).getByRole('button', { name: /clear unavailable/i }));
    fireEvent.click(within(customizer).getByLabelText(/sliced cheese/i));
    fireEvent.click(within(customizer).getByRole('button', { name: /update item · ₱168/i }));

    expect(screen.queryByRole('dialog', { name: 'Burger Deluxe' })).toBeNull();
    expect(within(dialog).queryByText('Options need attention')).toBeNull();
    expect(within(dialog).getByText('+Sliced Cheese')).toBeTruthy();
    expect(within(dialog).getByText('Note: Well done')).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: /place order · ₱168/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('persists dine-in table QR deep-link and opaque receipt session across reload, submits/updates payment ref, and blocks self-cancel once pending review', async () => {
    const { state } = installMockShopApi({
      initialStore: {
        dineInEnabled: true,
        dineInTableRequired: true,
        paymentMethods: {
          cash: {
            enabled: true,
            label: 'Cash',
            accountName: '',
            accountNumber: '',
            instructions: '',
            qrImageUrl: '',
          },
          gcash: {
            enabled: true,
            label: 'GCash Instant',
            accountName: '8Burgers OPC',
            accountNumber: '0917 555 1234',
            instructions: 'Scan QR or send exact amount.',
            qrImageUrl: '/storage/v1/object/public/menu-images/payment-qr/test.webp',
          },
          maya: {
            enabled: false,
            label: 'Maya',
            accountName: '',
            accountNumber: '',
            instructions: '',
            qrImageUrl: '',
          },
          bank_transfer: {
            enabled: false,
            label: 'Bank Transfer',
            accountName: '',
            accountNumber: '',
            instructions: '',
            qrImageUrl: '',
          },
        },
      },
    });

    window.sessionStorage.setItem(DINE_IN_TABLE_STORAGE_KEY, '7');
    useCartStore.getState().actions.rehydrateSessionStorage();

    const firstRender = render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    // Open cart drawer -> Dine-in preselected, Table 7 prefilled, disabled payment methods hidden
    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    expect(
      (within(dialog).getByRole('radio', { name: /dine-in/i }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((within(dialog).getByLabelText(/table number/i) as HTMLInputElement).value).toBe('7');

    const paymentSelect = within(dialog).getByLabelText(/payment method/i) as HTMLSelectElement;
    const optionValues = Array.from(paymentSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['cash', 'gcash']);

    fireEvent.change(paymentSelect, { target: { value: 'gcash' } });
    expect(within(dialog).getByText('0917 555 1234')).toBeTruthy();
    expect(within(dialog).getByAltText('GCash Instant QR code')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Bianca' } });
    fireEvent.change(within(dialog).getByLabelText(/^payment reference$/i), {
      target: { value: 'GC-1111' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱148/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('Dine-in · Table 7')).toBeTruthy();
    expect(within(dialog).getByText('Pending review')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /^cancel order$/i })).toBeNull();
    expect(
      within(dialog).getByText(/online cancellation is unavailable once a payment reference/i),
    ).toBeTruthy();

    // Verify opaque sessionStorage receipt token has zero PII
    const storedReceipt = window.sessionStorage.getItem(RECEIPT_SESSION_STORAGE_KEY) ?? '';
    expect(storedReceipt).toContain('#8B-101');
    expect(storedReceipt).toContain('receipt-token-101');
    expect(storedReceipt).not.toContain('Bianca');

    // Simulate mobile browser tab reload (in-memory lastPlacedOrder cleared, sessionStorage remains)
    firstRender.unmount();
    resetCartStore();
    useCartStore.getState().actions.rehydrateSessionStorage();
    useCartStore.getState().actions.setCartOpen(true);

    render(
      <TestQueryWrapper>
        <CartPortalDrawer />
      </TestQueryWrapper>,
    );

    const reloadedDialog = screen.getByRole('dialog', { name: /your order cart/i });
    expect(await within(reloadedDialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(reloadedDialog).getByText('Dine-in · Table 7')).toBeTruthy();

    // Correct typo in payment reference while still pending_verification
    const updateRefInput = within(reloadedDialog).getByLabelText(/update payment reference/i);
    fireEvent.change(updateRefInput, { target: { value: 'GC-9999' } });
    fireEvent.click(within(reloadedDialog).getByRole('button', { name: /update ref/i }));

    await waitFor(() => {
      expect(state.orders[0]?.paymentReference).toBe('GC-9999');
    });
    expect(
      await within(reloadedDialog).findByText(/payment reference updated for cashier review/i),
    ).toBeTruthy();
  });

  it('does not steal focus away from the receipt payment reference input when receipt polling refreshes', async () => {
    const { state } = installMockShopApi();
    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');

    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Marco' } });
    fireEvent.change(within(dialog).getByLabelText(/payment method/i), {
      target: { value: 'gcash' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^payment reference$/i), {
      target: { value: 'GC-1111' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();

    const refInput = within(dialog).getByLabelText(/update payment reference/i);
    refInput.focus();
    fireEvent.change(refInput, { target: { value: 'GC-42' } });
    expect(document.activeElement).toBe(refInput);

    // Simulate a background 15s receipt poll returning a fresh order snapshot
    if (state.orders[0]) {
      state.orders[0] = { ...state.orders[0], status: 'preparing', version: 2 };
    }
    fireEvent.click(within(dialog).getByRole('button', { name: /refresh status/i }));
    await within(dialog).findByText('On the Grill');

    // Focus must stay on the input (unless the user explicitly moved focus to Refresh)
    refInput.focus();
    if (state.orders[0]) {
      state.orders[0] = { ...state.orders[0], status: 'ready', version: 3 };
    }
    await waitFor(() => {
      // Trigger window focus refetch (which runs in background without clicking any button)
      fireEvent(window, new Event('focus'));
      expect(within(dialog).queryByText('Ready at Counter')).toBeTruthy();
    });
    expect(document.activeElement).toBe(refInput);
  });

  it('preserves dineInTable across order reset and clears unedited tableNumber when dineInTable is dismissed', async () => {
    const { state } = installMockShopApi({
      initialStore: {
        dineInEnabled: true,
        dineInTableRequired: true,
      },
    });

    window.sessionStorage.setItem(DINE_IN_TABLE_STORAGE_KEY, '7');
    useCartStore.getState().actions.rehydrateSessionStorage();

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    const tableInput = within(dialog).getByLabelText(/table number/i) as HTMLInputElement;
    expect(tableInput.value).toBe('7');

    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Bianca' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order · ₱148/i }));
    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();

    // Mark completed and dismiss receipt, then start a second order while dineInTable is still active
    const refreshBtn = await within(dialog).findByRole('button', { name: /refresh status/i });
    await waitFor(() => {
      expect((refreshBtn as HTMLButtonElement).disabled).toBe(false);
    });
    if (state.orders[0]) {
      state.orders[0] = { ...state.orders[0], status: 'completed', version: 2 };
    }
    fireEvent.click(refreshBtn);
    await within(dialog).findByText('Completed');

    fireEvent.click(within(dialog).getByRole('button', { name: /done · back to menu/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const nextDialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(nextDialog).findByText('Burger Deluxe');
    const nextTableInput = within(nextDialog).getByLabelText(/table number/i) as HTMLInputElement;
    expect(nextTableInput.value).toBe('7');

    // Dismissing the dine-in table banner clears the unedited tableNumber input
    useCartStore.getState().actions.clearDineInTable();
    await waitFor(() => {
      expect(nextTableInput.value).toBe('');
    });
  });

  it('does not trigger field validation errors or steal focus when submitting while checkout is disabled', async () => {
    installMockShopApi({
      initialStore: {
        acceptingOrders: false,
      },
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');
    const nameInput = within(dialog).getByLabelText(/your name/i);
    const submitButton = within(dialog).getByRole('button', { name: /place order/i });
    const form = submitButton.closest('form');
    expect(form).toBeTruthy();

    if (form) {
      fireEvent.submit(form);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
    expect(within(dialog).queryByText(/enter your name/i)).toBeNull();
    expect(document.activeElement).not.toBe(nameInput);
  });

  it('defaults payment method to the first enabled method when cash is disabled and switches cleanly', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { spy } = installMockShopApi({
      initialStore: {
        paymentMethods: {
          cash: {
            enabled: false,
            label: 'Cash',
            accountName: '',
            accountNumber: '',
            instructions: '',
            qrImageUrl: '',
          },
          gcash: {
            enabled: true,
            label: 'GCash',
            accountName: '8Burgers OPC',
            accountNumber: '0917 555 1234',
            instructions: '',
            qrImageUrl: '',
          },
          maya: {
            enabled: true,
            label: 'Maya',
            accountName: '8Burgers Maya',
            accountNumber: '0918 555 6789',
            instructions: '',
            qrImageUrl: '',
          },
          bank_transfer: {
            enabled: false,
            label: 'Bank Transfer',
            accountName: '',
            accountNumber: '',
            instructions: '',
            qrImageUrl: '',
          },
        },
      },
    });

    render(
      <TestQueryWrapper>
        <CartDrawerTestHarness />
      </TestQueryWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    await within(dialog).findByText('Burger Deluxe');

    const paymentSelect = within(dialog).getByLabelText(/payment method/i) as HTMLSelectElement;
    expect(paymentSelect.value).toBe('gcash');
    expect(within(dialog).getByText('0917 555 1234')).toBeTruthy();

    fireEvent.change(paymentSelect, { target: { value: 'maya' } });
    expect(paymentSelect.value).toBe('maya');
    expect(within(dialog).getByText('0918 555 6789')).toBeTruthy();

    fireEvent.change(paymentSelect, { target: { value: 'gcash' } });
    expect(paymentSelect.value).toBe('gcash');
    expect(within(dialog).getByText('0917 555 1234')).toBeTruthy();

    // Payment reference is required because cash is disabled
    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Marco' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order/i }));
    expect(await within(dialog).findByText(/enter the payment reference number/i)).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/^payment reference$/i), {
      target: { value: 'GC-2026' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /place order/i }));
    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();

    const orderPost = spy.mock.calls.find(
      ([input, init]) => String(input) === '/api/v1/orders' && init?.method === 'POST',
    );
    const payload = JSON.parse(String(orderPost?.[1]?.body ?? '{}')) as Record<string, unknown>;
    expect(payload.paymentMethod).toBe('gcash');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

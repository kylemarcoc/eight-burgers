import { DEFAULT_DELIVERY_PRICING, DEFAULT_MENU_ITEMS } from '@eight-burgers/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order/i }));

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
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
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order/i }));
    expect(document.activeElement).toBe(locationInput);

    fireEvent.click(within(dialog).getByRole('radio', { name: /kiosk pickup/i }));
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
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱183/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('#8B-101')).toBeTruthy();
    expect(
      within(dialog).getByText(/unit 402 — chino roces avenue, san antonio, makati/i),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/^zone:/i)).toBeNull();
    expect(within(dialog).getByText(/confirm gcash payment details/i)).toBeTruthy();
    const mapLink = within(dialog).getByRole('link', { name: /open in google maps/i });
    expect(mapLink.getAttribute('href')).toContain('https://maps.google.com/?q=14.56080,121.01240');

    fireEvent.click(within(dialog).getByRole('button', { name: /copy order summary/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
      expect(within(dialog).getByRole('button', { name: /order summary copied/i })).toBeTruthy();
    });
    expect(writeText.mock.calls[0]?.[0]).toContain('8Burgers Order #8B-101');
    expect(writeText.mock.calls[0]?.[0]).toContain('Total Due: ₱183');

    fireEvent.click(within(dialog).getByRole('button', { name: /done · back to menu/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
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
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱352/i }));
    expect(document.activeElement).toBe(
      within(dialog).getByLabelText(/street, building & rider notes/i),
    );

    // Clear GPS and search Bonifacio High Street (5.5 km -> ₱90 fee -> ₱388 total)
    fireEvent.click(within(dialog).getByRole('button', { name: /^change$/i }));
    const locationInput = within(dialog).getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(locationInput, { target: { value: 'Bonifacio' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /bonifacio high street/i }));
    expect(within(dialog).getByRole('button', { name: /buy order · ₱388/i })).toBeTruthy();
    expect(within(dialog).getByText(/estimated delivery · 25–35 min/i)).toBeTruthy();
    expect(
      within(dialog).getByText(/~5\.5 km from chino roces · ₱35 base \+ ₱10\/km/i),
    ).toBeTruthy();

    // Search out-of-range Tagaytay and recover via "Search another address"
    fireEvent.change(locationInput, { target: { value: 'Tagaytay' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /tagaytay rotonda/i }));
    expect(await within(dialog).findByText('Outside delivery area')).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: /buy order/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: /search another address/i }));
    expect(within(dialog).queryByText('Outside delivery area')).toBeNull();
    expect(document.activeElement).toBe(locationInput);

    // Search Filinvest Alabang (21.2 km -> ₱247 fee -> ₱545 total) then unlock free delivery above ₱500
    fireEvent.change(locationInput, { target: { value: 'Alabang' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /filinvest city alabang/i }));
    expect(within(dialog).getByRole('button', { name: /buy order · ₱545/i })).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole('button', { name: /increase quantity of overload burger/i }),
    );
    expect(within(dialog).getByText(/free delivery unlocked/i)).toBeTruthy();
    expect(within(dialog).getByText('₱247')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /buy order · ₱596/i })).toBeTruthy();

    // Submit using selectedAddress without requiring duplicate manual address entry
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱596/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText(/filinvest city alabang, alabang, muntinlupa/i)).toBeTruthy();
    expect(within(dialog).queryByText(/^zone:/i)).toBeNull();
    expect(within(dialog).getByText('Free (min. met)')).toBeTruthy();
  });

  it('disables delivery option when delivery is paused even above free-delivery subtotal and allows pickup checkout', async () => {
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
    const deliveryRadio = within(dialog).getByRole('radio', { name: /delivery/i });
    expect((deliveryRadio as HTMLInputElement).disabled).toBe(true);
    const deliveryOptionLabel = deliveryRadio.closest('label');
    expect(deliveryOptionLabel).toBeTruthy();
    if (deliveryOptionLabel) {
      expect(within(deliveryOptionLabel).getByText('Paused')).toBeTruthy();
      expect(within(deliveryOptionLabel).queryByText('Free')).toBeNull();
    }

    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Marco' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱596/i }));
    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('Chino Roces Pickup')).toBeTruthy();
  });

  it('auto-prunes deleted menu items with a notice and keeps checkout enabled for remaining items', async () => {
    installMockShopApi({
      initialMenu: DEFAULT_MENU_ITEMS.filter((item) => item.id !== 'chicano-burger'),
    });
    useCartStore.setState({
      cart: [
        { lineId: 'chicano-burger', itemId: 'chicano-burger', quantity: 1, addonIds: [] },
        { lineId: 'burger-deluxe', itemId: 'burger-deluxe', quantity: 1, addonIds: [] },
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
      (within(dialog).getByRole('button', { name: /buy order/i }) as HTMLButtonElement).disabled,
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
      cart: [{ lineId: 'burger-deluxe', itemId: 'burger-deluxe', quantity: 2, addonIds: [] }],
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
      cart: [{ lineId: 'burger-deluxe', itemId: 'burger-deluxe', quantity: 50, addonIds: [] }],
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
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱148/i }));

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
          deliveryEtaMinutes: '20–30 min',
          addressOrNotes: 'Ayala Ave',
          paymentMethod: 'gcash',
          lines: [
            {
              lineId: 'burger-deluxe',
              itemId: 'burger-deluxe',
              name: 'Burger Deluxe',
              unitPricePhp: 148,
              addonNames: [],
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
    expect(within(dialog).getByRole('button', { name: /buy order · ₱545/i })).toBeTruthy();

    // Editing the input clears the locked pin immediately so stale coordinates cannot be billed
    fireEvent.change(locationInput, { target: { value: 'Alabang Town' } });
    expect(within(dialog).getByText('Enter address')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /buy order · ₱298/i })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱298/i }));
    expect(
      within(dialog).getByText(
        /select a delivery address from the suggestions or use your device location/i,
      ),
    ).toBeTruthy();
    expect(document.activeElement).toBe(locationInput);

    const orderPosts = spy.mock.calls.filter(
      ([input, init]) => String(input) === '/api/v1/orders' && init?.method === 'POST',
    );
    expect(orderPosts).toHaveLength(0);
  });

  it('omits deliveryZoneId, clamps composed addressOrNotes to 500 chars, and resets delivery state for the next order', async () => {
    const { spy } = installMockShopApi();
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

    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱200/i }));
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

    // Dismiss receipt and start a fresh order -> delivery state must be reset
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
      name: /buy order · ₱200/i,
    }) as HTMLButtonElement;
    expect(buyDeliveryBtn.disabled).toBe(false);

    // Owner pauses delivery while customer already has Delivery selected
    state.deliveryPricing.deliveryEnabled = false;
    state.deliveryPricing.version = (state.deliveryPricing.version ?? 1) + 1;

    fireEvent.click(buyDeliveryBtn);

    expect(
      await within(dialog).findByText(
        /delivery is currently paused\. switch to chino roces pickup to continue\./i,
      ),
    ).toBeTruthy();
    expect(
      await within(dialog).findByText(
        /delivery is temporarily paused\. switch to kiosk pickup to place your order\./i,
      ),
    ).toBeTruthy();

    expect(
      (within(dialog).getByRole('radio', { name: /delivery/i }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(within(dialog).getAllByText('Paused')).toHaveLength(2);
    expect(within(dialog).queryByText('Enter address')).toBeNull();
    expect(
      (within(dialog).getByRole('button', { name: /buy order/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(nameInput.value).toBe('Marco');
    expect(mobileInput.value).toBe('09171234567');

    fireEvent.click(within(dialog).getByRole('button', { name: /switch to chino roces pickup/i }));

    expect(
      (within(dialog).getByRole('radio', { name: /kiosk pickup/i }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(within(dialog).queryByText(/delivery is currently paused\./i)).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱148/i }));
    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('#8B-101')).toBeTruthy();
    expect(within(dialog).getByText('Chino Roces Pickup')).toBeTruthy();
  });
});

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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetCartStore();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

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

  it('wires validation errors with aria-invalid/aria-describedby, focuses pin search when only pin is missing, and preserves input', async () => {
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
    const pinSearchInput = await within(dialog).findByLabelText(/pin delivery location/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order/i }));

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    const nameErrorId = nameInput.getAttribute('aria-describedby');
    expect(nameErrorId).toBeTruthy();
    expect(document.getElementById(nameErrorId ?? '')?.textContent).toContain('Enter your name');

    expect(pinSearchInput.getAttribute('aria-invalid')).toBe('true');
    const pinErrorId = pinSearchInput.getAttribute('aria-describedby');
    expect(pinErrorId).toBeTruthy();
    expect(document.getElementById(pinErrorId ?? '')?.textContent).toContain(
      'Pin your delivery location on the map',
    );

    const contactInput = within(dialog).getByLabelText(/mobile number/i);
    const notesInput = within(dialog).getByLabelText(/delivery address/i);
    expect(contactInput.getAttribute('aria-invalid')).toBe('true');
    expect(notesInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(nameInput, { target: { value: 'Marco' } });
    fireEvent.change(contactInput, { target: { value: '09171234567' } });
    fireEvent.change(notesInput, { target: { value: 'Yakal St, Makati' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order/i }));
    expect(document.activeElement).toBe(pinSearchInput);

    fireEvent.click(within(dialog).getByRole('radio', { name: /kiosk pickup/i }));
    expect(within(dialog).queryByText(/pin your delivery location on the map/i)).toBeNull();
    expect((nameInput as HTMLInputElement).value).toBe('Marco');
  });

  it('places a pinned delivery order via the API, copies summary with Google Maps link, and dismisses the receipt cleanly', async () => {
    installMockShopApi();
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

    const chinoRocesPinBtn = await within(dialog).findByRole('button', { name: 'Chino Roces' });
    fireEvent.click(chinoRocesPinBtn);

    fireEvent.change(within(dialog).getByLabelText(/delivery address/i), {
      target: { value: 'Chino Roces Tower' },
    });
    fireEvent.change(within(dialog).getByLabelText(/payment method/i), {
      target: { value: 'gcash' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱183/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('#8B-101')).toBeTruthy();
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

  it('auto-locks delivery zone by pin, blocks out-of-range pins, and unlocks free delivery above minimum subtotal', async () => {
    installMockShopApi({
      onExternalFetch: async () =>
        new Response(
          JSON.stringify([{ lat: '14.1153', lon: '120.9621', display_name: 'Tagaytay, Cavite' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
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

    const bgcPinBtn = await within(dialog).findByRole('button', { name: 'BGC' });
    fireEvent.click(bgcPinBtn);
    expect(within(dialog).getByRole('button', { name: /buy order · ₱373/i })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Alabang' }));
    expect(within(dialog).getByRole('button', { name: /buy order · ₱423/i })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/pin delivery location/i), {
      target: { value: 'Tagaytay' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^find$/i }));
    await waitFor(() => {
      expect(within(dialog).getByText('Outside delivery area')).toBeTruthy();
    });
    expect(
      (within(dialog).getByRole('button', { name: /buy order/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Alabang' }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: /increase quantity of overload burger/i }),
    );
    expect(within(dialog).getByText(/free delivery unlocked/i)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /buy order · ₱596/i })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Mia' } });
    fireEvent.change(within(dialog).getByLabelText(/mobile number/i), {
      target: { value: '09171234567' },
    });
    fireEvent.change(within(dialog).getByLabelText(/delivery address/i), {
      target: { value: 'Filinvest City, Alabang' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱596/i }));

    expect(await within(dialog).findByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('Delivery (Quezon City, Parañaque & Alabang)')).toBeTruthy();
    expect(within(dialog).getByText('Free (min. met)')).toBeTruthy();
  });

  it('disables delivery option when all delivery zones are paused', async () => {
    installMockShopApi({
      initialDeliveryPricing: {
        zones: DEFAULT_DELIVERY_PRICING.zones.map((zone) => ({ ...zone, enabled: false })),
        freeDeliveryMinSubtotalPhp: 500,
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
    const deliveryRadio = within(dialog).getByRole('radio', { name: /delivery/i });
    expect((deliveryRadio as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText('Paused')).toBeTruthy();
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
          deliveryZoneId: 'makati-core',
          deliveryZoneName: 'Makati Core',
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
});

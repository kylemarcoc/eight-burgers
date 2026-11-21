import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetShopStore,
  useShopActions,
  useShopCartOpen,
  useShopStore,
} from '@/shared/store/useShopStore';
import { CartPortalDrawer } from './CartPortalDrawer';

function CartDrawerTestHarness({ initialItemId = 'burger-deluxe' }: { initialItemId?: string }) {
  const { addToCart, setCartOpen } = useShopActions();
  const isCartOpen = useShopCartOpen();
  return (
    <div>
      <button type="button" onClick={() => addToCart(initialItemId)}>
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
  resetShopStore();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('CartPortalDrawer', () => {
  it('moves focus into the modal on open, traps Tab/Shift+Tab, and restores focus on Escape', () => {
    render(<CartDrawerTestHarness />);

    const openTrigger = screen.getByRole('button', { name: 'Open Drawer' });
    openTrigger.focus();
    fireEvent.click(openTrigger);

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    const closeBtn = within(dialog).getByRole('button', { name: /close cart drawer/i });
    const browseBtn = within(dialog).getByRole('button', { name: /browse menu/i });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from first focusable wraps to last focusable
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(browseBtn);

    // Tab from last focusable wraps to first focusable
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Escape closes and restores focus to trigger
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(openTrigger);
  });

  it('requires confirmation before clearing the cart', () => {
    render(<CartDrawerTestHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /clear cart/i }));

    // Canceling preserves the item
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(within(dialog).getByText('Burger Deluxe')).toBeTruthy();

    // Confirming clears the cart
    fireEvent.click(within(dialog).getByRole('button', { name: /clear cart/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm clear/i }));
    expect(within(dialog).getByText('Your cart is empty.')).toBeTruthy();
  });

  it('wires validation errors with aria-invalid and aria-describedby, focuses the pin search when only pin is missing, and preserves input', async () => {
    render(<CartDrawerTestHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    const nameInput = within(dialog).getByLabelText(/your name/i);

    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));
    const pinSearchInput = await within(dialog).findByLabelText(/pin delivery location/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order/i }));

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    const nameErrorId = nameInput.getAttribute('aria-describedby');
    expect(nameErrorId).toBeTruthy();
    expect(document.getElementById(nameErrorId ?? '')?.textContent).toContain('Enter your name');

    // Missing delivery pin also wires aria-invalid and aria-describedby on the pin search input
    expect(pinSearchInput.getAttribute('aria-invalid')).toBe('true');
    const pinErrorId = pinSearchInput.getAttribute('aria-describedby');
    expect(pinErrorId).toBeTruthy();
    expect(document.getElementById(pinErrorId ?? '')?.textContent).toContain(
      'Pin your delivery location on the map',
    );

    const notesInput = within(dialog).getByLabelText(/delivery address/i);
    expect(notesInput.getAttribute('aria-invalid')).toBe('true');

    // Filling name and address while leaving pin empty moves focus directly to pin search input on submit
    fireEvent.change(nameInput, { target: { value: 'Marco' } });
    fireEvent.change(notesInput, { target: { value: 'Yakal St, Makati' } });
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order/i }));
    expect(document.activeElement).toBe(pinSearchInput);

    // Switching back to pickup clears delivery pin & address errors
    fireEvent.click(within(dialog).getByRole('radio', { name: /kiosk pickup/i }));
    expect(within(dialog).queryByText(/pin your delivery location on the map/i)).toBeNull();
    expect(
      within(dialog)
        .getByLabelText(/pickup notes/i)
        .getAttribute('aria-invalid'),
    ).toBe('false');
    expect((nameInput as HTMLInputElement).value).toBe('Marco');
  });

  it('places a pinned delivery order, copies order summary with Google Maps link, and dismisses the receipt cleanly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<CartDrawerTestHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    fireEvent.change(within(dialog).getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));

    // Drop pin on Chino Roces (₱35 fee) -> ₱148 + ₱35 = ₱183
    const chinoRocesPinBtn = await within(dialog).findByRole('button', { name: 'Chino Roces' });
    fireEvent.click(chinoRocesPinBtn);

    fireEvent.change(within(dialog).getByLabelText(/delivery address/i), {
      target: { value: 'Chino Roces Tower' },
    });
    fireEvent.change(within(dialog).getByLabelText(/payment method/i), {
      target: { value: 'gcash' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱183/i }));

    expect(within(dialog).getByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('#8B-101')).toBeTruthy();
    expect(within(dialog).getByText('Total Due')).toBeTruthy();
    expect(within(dialog).getByText(/confirm gcash payment details/i)).toBeTruthy();
    const mapLink = within(dialog).getByRole('link', { name: /open in google maps/i });
    expect(mapLink.getAttribute('href')).toContain('https://maps.google.com/?q=14.56080,121.01240');

    fireEvent.click(within(dialog).getByRole('button', { name: /copy order summary/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
      expect(within(dialog).getByRole('button', { name: /order summary copied/i })).toBeTruthy();
    });
    expect(writeText.mock.calls[0]?.[0]).toContain('8Burgers Order #8B-101');
    expect(writeText.mock.calls[0]?.[0]).toContain('Map Pin: https://maps.google.com/?q=');
    expect(writeText.mock.calls[0]?.[0]).toContain('Total Due: ₱183');

    const smsLink = within(dialog).getByRole('link', { name: /send via sms/i });
    expect(smsLink.getAttribute('href')).toContain('sms:09165205707?body=');
    const fbLink = within(dialog).getByRole('link', { name: /open facebook page/i });
    expect(fbLink.getAttribute('href')).toContain('facebook.com');

    fireEvent.click(within(dialog).getByRole('button', { name: /done · back to menu/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('auto-locks delivery zone and fee by pinned location, blocks out-of-range pins, and unlocks free delivery above minimum subtotal', async () => {
    render(<CartDrawerTestHarness initialItemId="overload-burger" />);

    // 1x Overload Burger = ₱298 (below ₱500 threshold)
    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));

    // Pin BGC (~5.5 km -> BGC, Pasay & Mandaluyong ₱75) -> ₱298 + ₱75 = ₱373
    const bgcPinBtn = await within(dialog).findByRole('button', { name: 'BGC' });
    fireEvent.click(bgcPinBtn);
    expect(within(dialog).getByRole('button', { name: /buy order · ₱373/i })).toBeTruthy();
    expect(within(dialog).getByText(/more for free delivery/i)).toBeTruthy();

    // Pin Alabang (~21.2 km -> Quezon City, Parañaque & Alabang ₱125) -> ₱298 + ₱125 = ₱423
    fireEvent.click(within(dialog).getByRole('button', { name: 'Alabang' }));
    expect(within(dialog).getByRole('button', { name: /buy order · ₱423/i })).toBeTruthy();

    // Search an out-of-range location (Tagaytay) -> strictly blocked
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '14.1153', lon: '120.9621', display_name: 'Tagaytay, Cavite' }],
    } as Response);
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

    // Move pin back to Alabang and increase quantity to 2 -> ₱596 (>= ₱500) -> free delivery unlocked
    fireEvent.click(within(dialog).getByRole('button', { name: 'Alabang' }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: /increase quantity of overload burger/i }),
    );
    expect(within(dialog).getByText(/free delivery unlocked/i)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /buy order · ₱596/i })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/your name/i), { target: { value: 'Mia' } });
    fireEvent.change(within(dialog).getByLabelText(/delivery address/i), {
      target: { value: 'Filinvest City, Alabang' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱596/i }));

    expect(within(dialog).getByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('Delivery (Quezon City, Parañaque & Alabang)')).toBeTruthy();
    expect(within(dialog).getByText('Free (min. met)')).toBeTruthy();
  });

  it('disables delivery option when all delivery zones are paused', () => {
    const { toggleDeliveryZone } = useShopStore.getState().actions;
    for (const zone of useShopStore.getState().deliveryPricing.zones) {
      toggleDeliveryZone(zone.id);
    }

    render(<CartDrawerTestHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    const deliveryRadio = within(dialog).getByRole('radio', { name: /delivery/i });
    expect((deliveryRadio as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText('Paused')).toBeTruthy();
  });
});

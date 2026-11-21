import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetShopStore, useShopActions, useShopCartOpen } from '@/shared/store/useShopStore';
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

  it('wires validation errors with aria-invalid and aria-describedby and preserves input', () => {
    render(<CartDrawerTestHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Seed Burger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Drawer' }));

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    const nameInput = within(dialog).getByLabelText(/your name/i);

    fireEvent.click(within(dialog).getByRole('radio', { name: /delivery/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order/i }));

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    const nameErrorId = nameInput.getAttribute('aria-describedby');
    expect(nameErrorId).toBeTruthy();
    expect(document.getElementById(nameErrorId ?? '')?.textContent).toContain('Enter your name');

    const notesInput = within(dialog).getByLabelText(/makati delivery address/i);
    expect(notesInput.getAttribute('aria-invalid')).toBe('true');

    // Filling name clears name error while preserving typed text
    fireEvent.change(nameInput, { target: { value: 'Marco' } });
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');

    // Switching back to pickup clears delivery address error
    fireEvent.click(within(dialog).getByRole('radio', { name: /kiosk pickup/i }));
    expect(
      within(dialog)
        .getByLabelText(/pickup notes/i)
        .getAttribute('aria-invalid'),
    ).toBe('false');
    expect((nameInput as HTMLInputElement).value).toBe('Marco');
  });

  it('places an order, copies order summary / provides SMS & Facebook handoff, and dismisses the receipt cleanly', async () => {
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
    fireEvent.change(within(dialog).getByLabelText(/makati delivery address/i), {
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

    fireEvent.click(within(dialog).getByRole('button', { name: /copy order summary/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
      expect(within(dialog).getByRole('button', { name: /order summary copied/i })).toBeTruthy();
    });
    expect(writeText.mock.calls[0]?.[0]).toContain('8Burgers Order #8B-101');
    expect(writeText.mock.calls[0]?.[0]).toContain('Total Due: ₱183');

    const smsLink = within(dialog).getByRole('link', { name: /send via sms/i });
    expect(smsLink.getAttribute('href')).toContain('sms:09165205707?body=');
    const fbLink = within(dialog).getByRole('link', { name: /open facebook page/i });
    expect(fbLink.getAttribute('href')).toContain('facebook.com');

    fireEvent.click(within(dialog).getByRole('button', { name: /done · back to menu/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

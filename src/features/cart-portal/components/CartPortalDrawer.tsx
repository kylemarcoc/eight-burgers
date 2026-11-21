import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { FoodImage } from '@/shared/components/FoodImage';
import { STORE_METADATA } from '@/shared/shop/eight-burgers-seed';
import {
  useShopActions,
  useShopCartOpen,
  useShopCartSummary,
  useShopLastPlacedOrder,
} from '@/shared/store/useShopStore';
import {
  MAKATI_DELIVERY_FEE_PHP,
  formatOrderShareText,
  formatPhp,
} from '@/shared/shop/shop-storage';
import type { FulfillmentMode, PaymentMethod } from '@/shared/shop/types';

function buildSmsOrderHref(contact: string, body: string): string {
  const digits = contact.replace(/[^0-9+]/g, '');
  return `sms:${digits}?body=${encodeURIComponent(body)}`;
}

type CheckoutFieldErrors = {
  customerName?: string;
  addressOrNotes?: string;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  );
}

export function CartPortalDrawer() {
  const cartSummary = useShopCartSummary();
  const isCartOpen = useShopCartOpen();
  const lastPlacedOrder = useShopLastPlacedOrder();
  const { setCartOpen, setLineQuantity, removeCartLine, clearCart, placeOrder, dismissLastOrder } =
    useShopActions();

  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>('kiosk-pickup');
  const [addressOrNotes, setAddressOrNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const titleId = useId();
  const nameErrorId = useId();
  const addressErrorId = useId();

  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const notesInputRef = useRef<HTMLInputElement | null>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setConfirmClear(false);
    setCopyStatus('idle');
    setCartOpen(false);
  }, [setCartOpen]);

  useEffect(() => {
    if (!isCartOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const portalNode = portalRootRef.current;
    const isolatedSiblings: Array<{
      element: HTMLElement;
      hadInert: boolean;
      prevAriaHidden: string | null;
    }> = [];

    for (const child of Array.from(document.body.children)) {
      if (child instanceof HTMLElement && child !== portalNode) {
        isolatedSiblings.push({
          element: child,
          hadInert: child.hasAttribute('inert'),
          prevAriaHidden: child.getAttribute('aria-hidden'),
        });
        child.setAttribute('inert', '');
        child.setAttribute('aria-hidden', 'true');
      }
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            event.preventDefault();
            last?.focus();
          }
        } else if (active === last || !dialogRef.current.contains(active)) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;

      for (const entry of isolatedSiblings) {
        if (!entry.hadInert) {
          entry.element.removeAttribute('inert');
        }
        if (entry.prevAriaHidden === null) {
          entry.element.removeAttribute('aria-hidden');
        } else {
          entry.element.setAttribute('aria-hidden', entry.prevAriaHidden);
        }
      }

      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isCartOpen, handleClose]);

  useEffect(() => {
    if (isCartOpen && lastPlacedOrder && cartSummary.lines.length === 0) {
      receiptHeadingRef.current?.focus();
    }
  }, [isCartOpen, lastPlacedOrder, cartSummary.lines.length]);

  if (!isCartOpen) return null;

  const deliveryFeePhp = fulfillment === 'makati-delivery' ? MAKATI_DELIVERY_FEE_PHP : 0;
  const grandTotalPhp = cartSummary.subtotalPhp + deliveryFeePhp;

  function handleCheckoutSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: CheckoutFieldErrors = {};
    if (!customerName.trim()) {
      nextErrors.customerName = 'Enter your name so we can call your order.';
    }
    if (fulfillment === 'makati-delivery' && !addressOrNotes.trim()) {
      nextErrors.addressOrNotes = 'Enter your Makati street/building address for delivery.';
    }

    if (nextErrors.customerName || nextErrors.addressOrNotes) {
      setFieldErrors(nextErrors);
      if (nextErrors.customerName) {
        nameInputRef.current?.focus();
      } else if (nextErrors.addressOrNotes) {
        notesInputRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setConfirmClear(false);
    setCopyStatus('idle');
    placeOrder({
      customerName,
      contactNumber,
      fulfillment,
      addressOrNotes,
      paymentMethod,
    });
    setCustomerName('');
    setContactNumber('');
    setAddressOrNotes('');
  }

  return createPortal(
    <div ref={portalRootRef} className="fixed inset-0 z-50 flex justify-end">
      <div
        aria-hidden="true"
        onClick={handleClose}
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs"
      />

      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-ui-border bg-ui-surface text-ui-text shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-ui-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold tracking-tight">
              Your Order Cart
            </h2>
            <p className="text-xs text-ui-text-muted">{STORE_METADATA.branch}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            aria-label="Close cart drawer"
            className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lastPlacedOrder && cartSummary.lines.length === 0 ? (
            <div
              role="status"
              aria-live="polite"
              className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface-muted p-5"
            >
              <div className="flex items-center justify-between border-b border-dashed border-ui-border pb-3">
                <div>
                  <p className="text-xs font-semibold text-ui-accent uppercase">Order Confirmed</p>
                  <h3
                    ref={receiptHeadingRef}
                    tabIndex={-1}
                    className="mt-0.5 text-2xl font-bold text-ui-text tabular-nums focus:outline-none"
                  >
                    {lastPlacedOrder.queueNumber}
                  </h3>
                </div>
                <span className="rounded-lg bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text">
                  {lastPlacedOrder.fulfillment === 'kiosk-pickup'
                    ? 'Chino Roces Pickup'
                    : 'Makati Delivery'}
                </span>
              </div>

              <div className="space-y-1 text-xs text-ui-text-muted">
                <p>
                  <span className="font-semibold text-ui-text">Guest:</span>{' '}
                  {lastPlacedOrder.customerName}
                </p>
                <p>
                  <span className="font-semibold text-ui-text">Payment:</span>{' '}
                  {lastPlacedOrder.paymentMethod.toUpperCase()}
                </p>
                {lastPlacedOrder.addressOrNotes ? (
                  <p>
                    <span className="font-semibold text-ui-text">Details:</span>{' '}
                    {lastPlacedOrder.addressOrNotes}
                  </p>
                ) : null}
              </div>

              <ul className="space-y-2 border-y border-dashed border-ui-border py-3 text-sm">
                {lastPlacedOrder.lines.map((line) => (
                  <li key={line.lineId} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="font-semibold tabular-nums">{line.quantity}×</span>{' '}
                      {line.name}
                      {line.addonNames.length > 0 ? (
                        <span className="block text-xs text-ui-text-muted">
                          + {line.addonNames.join(', ')}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatPhp(line.lineTotalPhp)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-1 text-sm tabular-nums">
                <div className="flex justify-between text-ui-text-muted">
                  <span>Subtotal</span>
                  <span>{formatPhp(lastPlacedOrder.subtotalPhp)}</span>
                </div>
                {lastPlacedOrder.deliveryFeePhp > 0 ? (
                  <div className="flex justify-between text-ui-text-muted">
                    <span>Makati Delivery</span>
                    <span>{formatPhp(lastPlacedOrder.deliveryFeePhp)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-1 text-base font-bold text-ui-text">
                  <span>Total Due</span>
                  <span className="text-ui-accent">{formatPhp(lastPlacedOrder.totalPhp)}</span>
                </div>
              </div>

              {lastPlacedOrder.paymentMethod !== 'cash' ? (
                <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                  Confirm {lastPlacedOrder.paymentMethod.toUpperCase()} payment details with the
                  Chino Roces counter ({STORE_METADATA.contact}) when sending your order.
                </p>
              ) : null}

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const summaryText = formatOrderShareText(lastPlacedOrder);
                    if (
                      !navigator.clipboard ||
                      typeof navigator.clipboard.writeText !== 'function'
                    ) {
                      setCopyStatus('failed');
                      return;
                    }
                    void navigator.clipboard
                      .writeText(summaryText)
                      .then(() => setCopyStatus('copied'))
                      .catch(() => setCopyStatus('failed'));
                  }}
                  className="w-full rounded-xl border border-ui-border bg-ui-surface px-4 py-2 text-sm font-semibold text-ui-text hover:bg-ui-canvas"
                >
                  {copyStatus === 'copied'
                    ? 'Order Summary Copied'
                    : copyStatus === 'failed'
                      ? 'Copy Unavailable — Use SMS or Messenger Below'
                      : 'Copy Order Summary'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={buildSmsOrderHref(
                      STORE_METADATA.contact,
                      formatOrderShareText(lastPlacedOrder),
                    )}
                    className="inline-flex items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                  >
                    Send via SMS
                  </a>
                  <a
                    href={STORE_METADATA.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                  >
                    Open Facebook Page
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCopyStatus('idle');
                  dismissLastOrder();
                  handleClose();
                }}
                className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
              >
                Done · Back to Menu
              </button>
            </div>
          ) : cartSummary.lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-base font-semibold text-ui-text">Your cart is empty.</p>
              <p className="max-w-xs text-sm text-ui-text-muted">
                Add a 100g pure beef burger, crinkle fries, or nachos from the Chino Roces menu to
                start an order.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="mt-2 rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ui-text-muted uppercase">
                  {cartSummary.totalItems} {cartSummary.totalItems === 1 ? 'item' : 'items'} in bag
                </span>
                {confirmClear ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        clearCart();
                        setConfirmClear(false);
                      }}
                      className="rounded-md bg-ui-error px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Confirm clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="rounded-md border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="text-xs font-medium text-ui-error underline hover:opacity-80"
                  >
                    Clear cart
                  </button>
                )}
              </div>

              <ul className="space-y-3">
                {cartSummary.lines.map((line) => (
                  <li
                    key={line.lineId}
                    className="flex gap-3 rounded-2xl border border-ui-border bg-ui-surface-muted p-3"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ui-border bg-ui-surface">
                      <FoodImage
                        src={line.item.imageUrl}
                        alt={line.item.name}
                        category={line.item.category}
                        badgeText={line.item.name}
                        className="h-full w-full"
                      />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-ui-text">
                            {line.item.name}
                          </h3>
                          {line.addons.length > 0 ? (
                            <p className="text-xs text-ui-text-muted">
                              +{line.addons.map((addon) => addon.name).join(', ')}
                            </p>
                          ) : (
                            <p className="text-xs text-ui-text-muted">{line.item.pattySpec}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-bold text-ui-text tabular-nums">
                          {formatPhp(line.lineTotalPhp)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-lg border border-ui-border bg-ui-surface">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${line.item.name}`}
                            onClick={() => setLineQuantity(line.lineId, line.quantity - 1)}
                            className="px-2.5 py-1 text-sm font-bold text-ui-text hover:bg-ui-surface-muted"
                          >
                            -
                          </button>
                          <span className="min-w-7 text-center text-xs font-semibold tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${line.item.name}`}
                            onClick={() => setLineQuantity(line.lineId, line.quantity + 1)}
                            className="px-2.5 py-1 text-sm font-bold text-ui-text hover:bg-ui-surface-muted"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          aria-label={`Remove ${line.item.name} from cart`}
                          onClick={() => removeCartLine(line.lineId)}
                          className="text-xs font-medium text-ui-error underline hover:opacity-80"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <form
                noValidate
                onSubmit={handleCheckoutSubmit}
                className="space-y-3 border-t border-ui-border pt-4"
              >
                <h3 className="text-sm font-bold text-ui-text">Order Details</h3>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="checkout-name"
                      className="block text-xs font-semibold text-ui-text"
                    >
                      Your Name
                    </label>
                    <input
                      ref={nameInputRef}
                      id="checkout-name"
                      name="customerName"
                      type="text"
                      value={customerName}
                      aria-invalid={Boolean(fieldErrors.customerName)}
                      aria-describedby={fieldErrors.customerName ? nameErrorId : undefined}
                      onChange={(event) => {
                        setCustomerName(event.target.value);
                        if (fieldErrors.customerName && event.target.value.trim()) {
                          setFieldErrors((prev) => ({ ...prev, customerName: undefined }));
                        }
                      }}
                      placeholder="e.g. Marco"
                      className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                        fieldErrors.customerName ? 'border-ui-error' : 'border-ui-border'
                      }`}
                    />
                    {fieldErrors.customerName ? (
                      <p
                        id={nameErrorId}
                        role="alert"
                        className="mt-1 text-xs font-semibold text-ui-error"
                      >
                        {fieldErrors.customerName}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="checkout-contact"
                      className="block text-xs font-semibold text-ui-text"
                    >
                      Mobile (optional)
                    </label>
                    <input
                      id="checkout-contact"
                      name="contactNumber"
                      type="tel"
                      value={contactNumber}
                      onChange={(event) => setContactNumber(event.target.value)}
                      placeholder="0917 000 0000"
                      className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
                    />
                  </div>
                </div>

                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-semibold text-ui-text">Fulfillment</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                        fulfillment === 'kiosk-pickup'
                          ? 'border-ui-accent bg-ui-surface-muted font-semibold text-ui-text'
                          : 'border-ui-border bg-ui-surface text-ui-text-muted'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="fulfillment"
                          checked={fulfillment === 'kiosk-pickup'}
                          onChange={() => {
                            setFulfillment('kiosk-pickup');
                            setFieldErrors((prev) => ({ ...prev, addressOrNotes: undefined }));
                          }}
                          className="accent-ui-accent"
                        />
                        Kiosk Pickup
                      </span>
                      <span>Free</span>
                    </label>

                    <label
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                        fulfillment === 'makati-delivery'
                          ? 'border-ui-accent bg-ui-surface-muted font-semibold text-ui-text'
                          : 'border-ui-border bg-ui-surface text-ui-text-muted'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="fulfillment"
                          checked={fulfillment === 'makati-delivery'}
                          onChange={() => setFulfillment('makati-delivery')}
                          className="accent-ui-accent"
                        />
                        Delivery
                      </span>
                      <span className="tabular-nums">+{formatPhp(MAKATI_DELIVERY_FEE_PHP)}</span>
                    </label>
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor="checkout-notes"
                    className="block text-xs font-semibold text-ui-text"
                  >
                    {fulfillment === 'makati-delivery'
                      ? 'Makati Delivery Address'
                      : 'Pickup Notes (optional)'}
                  </label>
                  <input
                    ref={notesInputRef}
                    id="checkout-notes"
                    name="addressOrNotes"
                    type="text"
                    value={addressOrNotes}
                    aria-invalid={Boolean(fieldErrors.addressOrNotes)}
                    aria-describedby={fieldErrors.addressOrNotes ? addressErrorId : undefined}
                    onChange={(event) => {
                      setAddressOrNotes(event.target.value);
                      if (fieldErrors.addressOrNotes && event.target.value.trim()) {
                        setFieldErrors((prev) => ({ ...prev, addressOrNotes: undefined }));
                      }
                    }}
                    placeholder={
                      fulfillment === 'makati-delivery'
                        ? 'Building, unit, Chino Roces / Makati'
                        : 'e.g. Less mayo, extra napkins'
                    }
                    className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                      fieldErrors.addressOrNotes ? 'border-ui-error' : 'border-ui-border'
                    }`}
                  />
                  {fieldErrors.addressOrNotes ? (
                    <p
                      id={addressErrorId}
                      role="alert"
                      className="mt-1 text-xs font-semibold text-ui-error"
                    >
                      {fieldErrors.addressOrNotes}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="checkout-payment"
                    className="block text-xs font-semibold text-ui-text"
                  >
                    Payment Method
                  </label>
                  <select
                    id="checkout-payment"
                    name="paymentMethod"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
                  >
                    <option value="cash">Cash at Kiosk / COD</option>
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                  </select>
                </div>

                <div className="space-y-1 rounded-xl border border-ui-border bg-ui-surface-muted p-3 text-sm tabular-nums">
                  <div className="flex justify-between text-ui-text-muted">
                    <span>Subtotal</span>
                    <span>{formatPhp(cartSummary.subtotalPhp)}</span>
                  </div>
                  <div className="flex justify-between text-ui-text-muted">
                    <span>Delivery fee</span>
                    <span>{deliveryFeePhp > 0 ? formatPhp(deliveryFeePhp) : 'Free'}</span>
                  </div>
                  <div className="flex justify-between border-t border-ui-border pt-1.5 text-base font-bold text-ui-text">
                    <span>Total</span>
                    <span className="text-ui-accent">{formatPhp(grandTotalPhp)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-ui-accent px-4 py-3 text-sm font-bold text-ui-on-accent tabular-nums hover:bg-ui-accent-hover"
                >
                  Buy Order · {formatPhp(grandTotalPhp)}
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

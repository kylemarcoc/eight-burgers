import { normalizeQueueNumber, type PublicOrderTracker } from '@eight-burgers/contracts';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { createPortal } from 'react-dom';
import { useCatalogQuery } from '@/features/menu-catalog';
import {
  useCancelOrderByQueueMutation,
  useCancelOrderByReceiptMutation,
  useOrderReceiptQuery,
  usePlaceOrderMutation,
  usePublicOrderTrackerQuery,
} from '@/features/orders';
import { FoodImage } from '@/shared/components/FoodImage';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { STORE_METADATA } from '@/shared/shop/eight-burgers-seed';
import {
  buildGoogleMapsPinUrl,
  calculateDeliveryQuote,
  formatOrderShareText,
  formatPhp,
  isValidCoordinates,
} from '@/shared/shop/shop-storage';
import type {
  DeliveryPricingConfig,
  FulfillmentMode,
  GeoCoordinates,
  OrderStatus,
  PaymentMethod,
} from '@/shared/shop/types';
import {
  useCartActions,
  useCartLines,
  useCartOpen,
  useLastPlacedOrder,
  useTrackedQueueNumber,
} from '@/shared/store/useCartStore';
import { useResolvedCartSummary } from '../hooks/useResolvedCartSummary';
import { DeliveryLocationPicker } from './DeliveryLocationPicker';

const EMPTY_DELIVERY_PRICING: DeliveryPricingConfig = {
  deliveryEnabled: false,
  baseFeePhp: 0,
  perKmRatePhp: 0,
  maxDistanceKm: 25,
  freeDeliveryMinSubtotalPhp: null,
};

const RECEIPT_STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Received',
  grilling: 'On the Grill',
  ready: 'Ready for Pickup / Dispatch',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PROGRESS_STAGE_ORDER: readonly Exclude<OrderStatus, 'cancelled'>[] = [
  'received',
  'grilling',
  'ready',
  'completed',
];

function KitchenProgressTracker({
  status,
  fulfillment,
  deliveryEtaMinutes,
}: {
  status: OrderStatus;
  fulfillment: FulfillmentMode;
  deliveryEtaMinutes?: string;
}) {
  if (status === 'cancelled') {
    return (
      <div
        role="region"
        aria-label="Live kitchen progress"
        className="rounded-xl border border-ui-error/40 bg-ui-error/10 px-3.5 py-3 text-xs text-ui-error"
      >
        <p className="font-bold">Order Cancelled</p>
        <p className="mt-0.5 text-ui-text-muted">
          This order was cancelled and removed from the active kitchen queue.
        </p>
      </div>
    );
  }

  const currentIdx = PROGRESS_STAGE_ORDER.indexOf(status);
  const steps: ReadonlyArray<{
    key: Exclude<OrderStatus, 'cancelled'>;
    label: string;
    detail: string;
  }> = [
    {
      key: 'received',
      label: 'Order Received',
      detail: 'Ticket is in the kitchen queue',
    },
    {
      key: 'grilling',
      label: 'On the Grill',
      detail: 'Fresh beef patties are on the grill',
    },
    {
      key: 'ready',
      label: fulfillment === 'kiosk-pickup' ? 'Ready at Counter' : 'Out for Delivery',
      detail:
        fulfillment === 'kiosk-pickup'
          ? 'Pick up at Chino Roces counter'
          : deliveryEtaMinutes
            ? `Estimated ${deliveryEtaMinutes}`
            : 'Ready for rider dispatch',
    },
    {
      key: 'completed',
      label: 'Completed',
      detail: 'Order handed off',
    },
  ];

  return (
    <div className="space-y-2 rounded-xl border border-ui-border bg-ui-surface p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ui-text">Live Kitchen Progress</span>
        <span className="font-medium text-ui-accent">{RECEIPT_STATUS_LABELS[status]}</span>
      </div>
      <ol aria-label="Live kitchen progress" className="grid grid-cols-2 gap-2">
        {steps.map((step, index) => {
          const isCompleted = index < currentIdx || status === 'completed';
          const isCurrent = index === currentIdx && status !== 'completed';
          return (
            <li
              key={step.key}
              aria-current={isCurrent ? 'step' : undefined}
              className={`rounded-lg border px-2.5 py-2 text-xs ${
                isCurrent
                  ? 'border-ui-accent bg-ui-surface-muted font-semibold text-ui-text'
                  : isCompleted
                    ? 'border-ui-border bg-ui-surface-muted/60 text-ui-text'
                    : 'border-ui-border/60 bg-ui-canvas text-ui-text-muted opacity-75'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold">{step.label}</span>
                <span className="text-[11px] font-medium">
                  {isCurrent ? 'Now' : isCompleted ? 'Done' : ''}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-normal text-ui-text-muted">{step.detail}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `eb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function buildSmsOrderHref(contact: string, body: string): string {
  const digits = contact.replace(/[^0-9+]/g, '');
  return `sms:${digits}?body=${encodeURIComponent(body)}`;
}

type CheckoutFieldErrors = {
  customerName?: string;
  contactNumber?: string;
  deliveryPin?: string;
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

function isElementVisible(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden') || element.closest('[hidden], [inert]')) {
    return false;
  }
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') && element.tabIndex !== -1 && isElementVisible(element),
  );
}

export function CartPortalDrawer() {
  const catalogQuery = useCatalogQuery();
  const cartLines = useCartLines();
  const cartSummary = useResolvedCartSummary();
  const isCartOpen = useCartOpen();
  const lastPlacedOrderState = useLastPlacedOrder();
  const trackedQueueNumber = useTrackedQueueNumber();
  const {
    setCartOpen,
    setLineQuantity,
    removeCartLine,
    clearCart,
    setLastPlacedOrder,
    setTrackedQueueNumber,
    dismissLastOrder,
  } = useCartActions();

  const activeQueueNumber = trackedQueueNumber ?? lastPlacedOrderState?.order.queueNumber ?? null;
  const hasMatchingInMemoryReceipt = Boolean(
    lastPlacedOrderState &&
    (!activeQueueNumber ||
      normalizeQueueNumber(lastPlacedOrderState.order.queueNumber) ===
        normalizeQueueNumber(activeQueueNumber)),
  );

  const placeOrderMutation = usePlaceOrderMutation();
  const cancelByReceiptMutation = useCancelOrderByReceiptMutation();
  const cancelByQueueMutation = useCancelOrderByQueueMutation();

  const liveReceiptQuery = useOrderReceiptQuery(
    hasMatchingInMemoryReceipt ? (lastPlacedOrderState?.order.id ?? null) : null,
    hasMatchingInMemoryReceipt ? (lastPlacedOrderState?.receiptToken ?? null) : null,
    hasMatchingInMemoryReceipt,
  );
  const publicTrackerQuery = usePublicOrderTrackerQuery(
    activeQueueNumber,
    Boolean(activeQueueNumber && !hasMatchingInMemoryReceipt),
  );

  const lastPlacedOrder = hasMatchingInMemoryReceipt
    ? (liveReceiptQuery.data ?? lastPlacedOrderState?.order ?? null)
    : null;
  const publicTrackedOrder: PublicOrderTracker | null = !hasMatchingInMemoryReceipt
    ? (publicTrackerQuery.data ?? null)
    : null;
  const hasTrackedOrderContext = Boolean(lastPlacedOrder || activeQueueNumber);
  const deliveryPricing = catalogQuery.data?.deliveryPricing ?? EMPTY_DELIVERY_PRICING;

  const [drawerTab, setDrawerTab] = useState<'bag' | 'tracker'>('bag');
  const [queueLookupInput, setQueueLookupInput] = useState('');
  const [queueLookupError, setQueueLookupError] = useState<string | null>(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(false);
  const [cancelVerificationInput, setCancelVerificationInput] = useState('');
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>('kiosk-pickup');
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [deliveryPin, setDeliveryPin] = useState<GeoCoordinates | null>(null);
  const [addressOrNotes, setAddressOrNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);
  const [lastPrunedKey, setLastPrunedKey] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const titleId = useId();
  const nameErrorId = useId();
  const contactErrorId = useId();
  const locationErrorId = useId();
  const addressErrorId = useId();

  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const contactInputRef = useRef<HTMLInputElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const notesInputRef = useRef<HTMLInputElement | null>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const hasDeliveryPin = fulfillment === 'delivery' && isValidCoordinates(deliveryPin);

  const deliveryQuote = useMemo(
    () =>
      calculateDeliveryQuote({
        fulfillment,
        subtotalPhp: cartSummary.subtotalPhp,
        deliveryPricing,
        pin: hasDeliveryPin ? deliveryPin : null,
      }),
    [fulfillment, cartSummary.subtotalPhp, deliveryPricing, hasDeliveryPin, deliveryPin],
  );

  const isQuoteResolved = hasDeliveryPin && deliveryQuote.available && !deliveryQuote.outOfRange;
  const isOutOfRange = hasDeliveryPin && deliveryQuote.outOfRange;

  const attemptSignature = useMemo(
    () =>
      JSON.stringify({
        cart: cartLines,
        fulfillment,
        deliveryPin: hasDeliveryPin ? deliveryPin : null,
        selectedAddress: fulfillment === 'delivery' ? (selectedAddress ?? null) : null,
        customerName: customerName.trim(),
        contactNumber: contactNumber.trim(),
        addressOrNotes: addressOrNotes.trim(),
        paymentMethod,
      }),
    [
      cartLines,
      fulfillment,
      hasDeliveryPin,
      deliveryPin,
      selectedAddress,
      customerName,
      contactNumber,
      addressOrNotes,
      paymentMethod,
    ],
  );
  const idempotencyRef = useRef<{ signature: string; key: string }>({
    signature: '',
    key: createIdempotencyKey(),
  });

  function getOrRotateIdempotencyKey(): string {
    if (idempotencyRef.current.signature !== attemptSignature) {
      idempotencyRef.current = {
        signature: attemptSignature,
        key: createIdempotencyKey(),
      };
    }
    return idempotencyRef.current.key;
  }

  const handleClose = useCallback(() => {
    setConfirmClear(false);
    setConfirmCancelOrder(false);
    setCancelVerificationInput('');
    setCancelOrderError(null);
    setQueueLookupError(null);
    setCopyStatus('idle');
    setSubmitError(null);
    setRemovedNotice(null);
    setCartOpen(false);
  }, [setCartOpen]);

  const handleClearLocation = useCallback(() => {
    setDeliveryPin(null);
    setSelectedAddress(null);
    setSubmitError(null);
  }, []);

  const handleSelectLocation = useCallback(
    (nextPin: GeoCoordinates, resolvedAddress?: string | null) => {
      setDeliveryPin(nextPin);
      setSelectedAddress(resolvedAddress ?? null);
      setSubmitError(null);
      setFieldErrors((prev) => ({
        ...prev,
        deliveryPin: undefined,
        ...(resolvedAddress ? { addressOrNotes: undefined } : {}),
      }));
    },
    [],
  );

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
        if (event.defaultPrevented) return;
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

  const removedLinesKey = catalogQuery.isSuccess ? cartSummary.removedLineIds.join(',') : '';
  if (removedLinesKey && removedLinesKey !== lastPrunedKey) {
    const count = cartSummary.removedLineIds.length;
    setLastPrunedKey(removedLinesKey);
    setRemovedNotice(
      `Removed ${count} ${count === 1 ? 'item' : 'items'} from your bag that ${
        count === 1 ? 'is' : 'are'
      } no longer on the menu.`,
    );
  }

  useEffect(() => {
    if (!catalogQuery.isSuccess || cartSummary.removedLineIds.length === 0) return;
    for (const lineId of cartSummary.removedLineIds) {
      removeCartLine(lineId);
    }
  }, [catalogQuery.isSuccess, cartSummary.removedLineIds, removeCartLine]);

  useEffect(() => {
    if (isCartOpen && lastPlacedOrder && cartSummary.lines.length === 0 && cartLines.length === 0) {
      receiptHeadingRef.current?.focus();
    }
  }, [isCartOpen, lastPlacedOrder, cartSummary.lines.length, cartLines.length]);

  if (!isCartOpen) return null;

  const isDeliveryEnabled = deliveryPricing.deliveryEnabled;
  const hasUnavailableItems = cartSummary.unavailableLineIds.length > 0;
  const hasTooManyLines = cartSummary.lines.length > 50;

  const baseFeePhp = Math.max(0, Math.round(deliveryPricing.baseFeePhp));
  const perKmRatePhp = Math.max(0, Math.round(deliveryPricing.perKmRatePhp));

  const deliveryOptionBadge = !isDeliveryEnabled
    ? 'Paused'
    : fulfillment === 'delivery' && isOutOfRange
      ? 'Out of range'
      : fulfillment === 'delivery' && isQuoteResolved
        ? deliveryQuote.isFreeDelivery || deliveryQuote.feePhp === 0
          ? 'Free'
          : `+${formatPhp(deliveryQuote.feePhp)}`
        : deliveryQuote.freeDeliveryMinSubtotalPhp !== null &&
            cartSummary.subtotalPhp >= deliveryQuote.freeDeliveryMinSubtotalPhp
          ? 'Free'
          : baseFeePhp === 0 && perKmRatePhp === 0
            ? 'Free'
            : perKmRatePhp > 0
              ? `From ${formatPhp(baseFeePhp)}`
              : `+${formatPhp(baseFeePhp)}`;

  const deliveryFeePhp = isQuoteResolved ? deliveryQuote.feePhp : 0;
  const grandTotalPhp = cartSummary.subtotalPhp + deliveryFeePhp;
  const isDeliveryBlocked = fulfillment === 'delivery' && (!isDeliveryEnabled || isOutOfRange);
  const isCheckoutDisabled =
    isDeliveryBlocked || hasUnavailableItems || hasTooManyLines || placeOrderMutation.isPending;

  const freeDeliveryProgressPct =
    deliveryQuote.freeDeliveryMinSubtotalPhp && deliveryQuote.freeDeliveryMinSubtotalPhp > 0
      ? Math.min(
          100,
          Math.round((cartSummary.subtotalPhp / deliveryQuote.freeDeliveryMinSubtotalPhp) * 100),
        )
      : 0;

  async function handleCheckoutSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCheckoutDisabled) return;

    const trimmedSelectedAddress = selectedAddress?.trim() ?? '';
    const trimmedNotes = addressOrNotes.trim();
    const composedAddressOrNotes =
      fulfillment === 'delivery'
        ? trimmedNotes && trimmedSelectedAddress
          ? `${trimmedNotes} — ${trimmedSelectedAddress}`.slice(0, 500)
          : (trimmedNotes || trimmedSelectedAddress).slice(0, 500)
        : trimmedNotes;

    const nextErrors: CheckoutFieldErrors = {};
    if (!customerName.trim()) {
      nextErrors.customerName = 'Enter your name so we can call your order.';
    }
    if (fulfillment === 'delivery' && !contactNumber.trim()) {
      nextErrors.contactNumber = 'Enter a mobile number so the rider can reach you.';
    }
    if (fulfillment === 'delivery' && !hasDeliveryPin) {
      nextErrors.deliveryPin =
        'Select a delivery address from the suggestions or use your device location.';
    }
    if (fulfillment === 'delivery' && !composedAddressOrNotes) {
      nextErrors.addressOrNotes = 'Enter your street, building, unit, or landmark for the rider.';
    }

    if (
      nextErrors.customerName ||
      nextErrors.contactNumber ||
      nextErrors.deliveryPin ||
      nextErrors.addressOrNotes
    ) {
      setFieldErrors(nextErrors);
      if (nextErrors.customerName) {
        nameInputRef.current?.focus();
      } else if (nextErrors.contactNumber) {
        contactInputRef.current?.focus();
      } else if (nextErrors.deliveryPin) {
        locationInputRef.current?.focus();
      } else if (nextErrors.addressOrNotes) {
        notesInputRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setConfirmClear(false);
    setCopyStatus('idle');

    const idempotencyKey = getOrRotateIdempotencyKey();

    try {
      const response = await placeOrderMutation.mutateAsync({
        idempotencyKey,
        payload: {
          customerName: customerName.trim(),
          contactNumber: contactNumber.trim(),
          fulfillment,
          ...(fulfillment === 'delivery' && deliveryPin ? { deliveryPin } : {}),
          addressOrNotes: composedAddressOrNotes,
          paymentMethod,
          items: cartSummary.lines.map((line) => ({
            itemId: line.item.id,
            quantity: line.quantity,
            addonIds: line.addons.map((addon) => addon.id),
          })),
          expectedTotalPhp: grandTotalPhp,
        },
      });

      clearCart();
      setLastPlacedOrder({
        order: response.data,
        receiptToken: response.receiptToken,
      });
      setDrawerTab('tracker');
      setConfirmCancelOrder(false);
      setCancelVerificationInput('');
      setCancelOrderError(null);
      idempotencyRef.current = { signature: '', key: createIdempotencyKey() };
      setCustomerName('');
      setContactNumber('');
      setAddressOrNotes('');
      setSelectedAddress(null);
      setDeliveryPin(null);
    } catch (error) {
      if (isApiError(error) && error.code === 'PRICE_CHANGED') {
        idempotencyRef.current = { signature: '', key: createIdempotencyKey() };
        setSubmitError(
          'Menu or delivery prices just updated. Review your updated total below and submit again.',
        );
      } else {
        setSubmitError(
          getApiErrorMessage(error, 'Could not submit your order right now. Please try again.'),
        );
      }
    }
  }

  function handleQueueLookupSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeQueueNumber(queueLookupInput);
    if (!normalized) {
      setQueueLookupError('Enter your queue number (for example #8B-101 or 101).');
      return;
    }
    setQueueLookupError(null);
    setConfirmCancelOrder(false);
    setCancelVerificationInput('');
    setCancelOrderError(null);
    setTrackedQueueNumber(normalized);
    setDrawerTab('tracker');
    setQueueLookupInput('');
  }

  async function handleConfirmReceiptCancel() {
    if (!lastPlacedOrderState || !lastPlacedOrder) return;
    setCancelOrderError(null);
    try {
      const updated = await cancelByReceiptMutation.mutateAsync({
        orderId: lastPlacedOrder.id,
        receiptToken: lastPlacedOrderState.receiptToken,
      });
      setLastPlacedOrder({
        order: updated,
        receiptToken: lastPlacedOrderState.receiptToken,
      });
      setConfirmCancelOrder(false);
    } catch (error) {
      setCancelOrderError(
        getApiErrorMessage(error, 'Could not cancel this order right now. Please try again.'),
      );
    }
  }

  async function handleConfirmPublicQueueCancel(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publicTrackedOrder) return;
    const trimmed = cancelVerificationInput.trim();
    if (!trimmed) {
      setCancelOrderError(
        publicTrackedOrder.fulfillment === 'delivery'
          ? 'Enter the mobile number used on this delivery order.'
          : 'Enter the customer name used on this pickup order.',
      );
      return;
    }
    setCancelOrderError(null);
    try {
      await cancelByQueueMutation.mutateAsync({
        queueNumber: publicTrackedOrder.queueNumber,
        verification:
          publicTrackedOrder.fulfillment === 'delivery'
            ? { contactNumber: trimmed }
            : { customerName: trimmed },
      });
      setConfirmCancelOrder(false);
      setCancelVerificationInput('');
    } catch (error) {
      setCancelOrderError(
        getApiErrorMessage(
          error,
          'Could not verify and cancel this order. Check your details and try again.',
        ),
      );
    }
  }

  const showTrackerView =
    hasTrackedOrderContext &&
    (cartSummary.lines.length === 0 && cartLines.length === 0 ? true : drawerTab === 'tracker');

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
          {hasTrackedOrderContext && (cartSummary.lines.length > 0 || cartLines.length > 0) ? (
            <div
              role="tablist"
              aria-label="Cart drawer view"
              className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl border border-ui-border bg-ui-surface-muted p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!showTrackerView}
                onClick={() => setDrawerTab('bag')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  !showTrackerView
                    ? 'bg-ui-accent text-ui-on-accent'
                    : 'text-ui-text-muted hover:text-ui-text'
                }`}
              >
                Your Bag ({cartSummary.totalItems})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showTrackerView}
                onClick={() => setDrawerTab('tracker')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                  showTrackerView
                    ? 'bg-ui-accent text-ui-on-accent'
                    : 'text-ui-text-muted hover:text-ui-text'
                }`}
              >
                Order {activeQueueNumber}
              </button>
            </div>
          ) : null}

          {showTrackerView && lastPlacedOrder ? (
            <div
              role="status"
              aria-live="polite"
              className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface-muted p-5"
            >
              <div className="flex items-center justify-between border-b border-dashed border-ui-border pb-3">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase ${
                      lastPlacedOrder.status === 'cancelled' ? 'text-ui-error' : 'text-ui-accent'
                    }`}
                  >
                    {lastPlacedOrder.status === 'cancelled' ? 'Order Cancelled' : 'Order Confirmed'}
                  </p>
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
                    : 'Delivery'}
                </span>
              </div>

              <KitchenProgressTracker
                status={lastPlacedOrder.status}
                fulfillment={lastPlacedOrder.fulfillment}
                deliveryEtaMinutes={lastPlacedOrder.deliveryEtaMinutes}
              />

              <div className="space-y-1 text-xs text-ui-text-muted">
                <p>
                  <span className="font-semibold text-ui-text">Guest:</span>{' '}
                  {lastPlacedOrder.customerName}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p>
                    <span className="font-semibold text-ui-text">Status:</span>{' '}
                    <span>{RECEIPT_STATUS_LABELS[lastPlacedOrder.status]}</span>
                  </p>
                  {lastPlacedOrder.status !== 'completed' &&
                  lastPlacedOrder.status !== 'cancelled' ? (
                    <button
                      type="button"
                      disabled={liveReceiptQuery.isFetching}
                      onClick={() => void liveReceiptQuery.refetch()}
                      className="rounded-md border border-ui-border bg-ui-surface px-2 py-0.5 text-[11px] font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
                    >
                      {liveReceiptQuery.isFetching ? 'Checking…' : 'Refresh status'}
                    </button>
                  ) : null}
                </div>
                {liveReceiptQuery.isError ? (
                  <p role="alert" className="text-[11px] font-medium text-ui-error">
                    Unable to refresh live status right now. Showing your last confirmed status.
                  </p>
                ) : null}
                <p>
                  <span className="font-semibold text-ui-text">Payment:</span>{' '}
                  {lastPlacedOrder.paymentMethod.toUpperCase()}
                </p>
                {lastPlacedOrder.fulfillment === 'delivery' &&
                (typeof lastPlacedOrder.deliveryDistanceKm === 'number' ||
                  lastPlacedOrder.deliveryEtaMinutes) ? (
                  <p>
                    <span className="font-semibold text-ui-text">Delivery:</span>{' '}
                    {typeof lastPlacedOrder.deliveryDistanceKm === 'number'
                      ? `~${lastPlacedOrder.deliveryDistanceKm.toFixed(1)} km`
                      : ''}
                    {typeof lastPlacedOrder.deliveryDistanceKm === 'number' &&
                    lastPlacedOrder.deliveryEtaMinutes
                      ? ' · '
                      : ''}
                    {lastPlacedOrder.deliveryEtaMinutes
                      ? `Est. ${lastPlacedOrder.deliveryEtaMinutes}`
                      : ''}
                  </p>
                ) : null}
                {lastPlacedOrder.addressOrNotes ? (
                  <p>
                    <span className="font-semibold text-ui-text">Details:</span>{' '}
                    {lastPlacedOrder.addressOrNotes}
                  </p>
                ) : null}
                {lastPlacedOrder.fulfillment === 'delivery' &&
                isValidCoordinates(lastPlacedOrder.deliveryPin) ? (
                  <p>
                    <span className="font-semibold text-ui-text">Rider Pin:</span>{' '}
                    <a
                      href={buildGoogleMapsPinUrl(lastPlacedOrder.deliveryPin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-ui-accent underline underline-offset-2"
                    >
                      Open in Google Maps
                    </a>
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
                {lastPlacedOrder.fulfillment === 'delivery' ? (
                  <div className="flex justify-between text-ui-text-muted">
                    <span>Delivery</span>
                    <span>
                      {lastPlacedOrder.deliveryFeePhp > 0
                        ? formatPhp(lastPlacedOrder.deliveryFeePhp)
                        : lastPlacedOrder.deliveryFeeWaived
                          ? 'Free (min. met)'
                          : 'Free'}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-1 text-base font-bold text-ui-text">
                  <span>Total Due</span>
                  <span className="text-ui-accent">{formatPhp(lastPlacedOrder.totalPhp)}</span>
                </div>
              </div>

              {lastPlacedOrder.paymentMethod !== 'cash' &&
              lastPlacedOrder.status !== 'cancelled' ? (
                <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                  Confirm {lastPlacedOrder.paymentMethod.toUpperCase()} payment details with the
                  Chino Roces counter ({STORE_METADATA.contact}) when sending your order.
                </p>
              ) : null}

              {lastPlacedOrder.status === 'received' && lastPlacedOrderState?.receiptToken ? (
                <div className="space-y-2 rounded-xl border border-ui-border bg-ui-surface p-3">
                  {cancelOrderError ? (
                    <p role="alert" className="text-xs font-semibold text-ui-error">
                      {cancelOrderError}
                    </p>
                  ) : null}
                  {confirmCancelOrder ? (
                    <div className="space-y-2">
                      <p className="text-xs text-ui-text">
                        Cancel order{' '}
                        <span className="font-semibold">{lastPlacedOrder.queueNumber}</span> before
                        it goes on the grill?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={cancelByReceiptMutation.isPending}
                          onClick={() => void handleConfirmReceiptCancel()}
                          className="rounded-lg bg-ui-error px-3 py-1.5 text-xs font-semibold text-ui-on-error hover:opacity-90 disabled:opacity-50"
                        >
                          {cancelByReceiptMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                        </button>
                        <button
                          type="button"
                          disabled={cancelByReceiptMutation.isPending}
                          onClick={() => {
                            setConfirmCancelOrder(false);
                            setCancelOrderError(null);
                          }}
                          className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                        >
                          Keep Order
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-ui-text-muted">
                        Need to change or cancel before grilling starts?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmCancelOrder(true);
                          setCancelOrderError(null);
                        }}
                        className="shrink-0 rounded-lg border border-ui-error/40 bg-ui-error/10 px-2.5 py-1 text-xs font-semibold text-ui-error hover:bg-ui-error/20"
                      >
                        Cancel Order
                      </button>
                    </div>
                  )}
                </div>
              ) : lastPlacedOrder.status === 'grilling' || lastPlacedOrder.status === 'ready' ? (
                <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                  This order is already being prepared in the kitchen and can no longer be cancelled
                  online.
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
                  setConfirmCancelOrder(false);
                  setCancelOrderError(null);
                  dismissLastOrder();
                  handleClose();
                }}
                className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
              >
                Done · Back to Menu
              </button>
            </div>
          ) : showTrackerView && activeQueueNumber ? (
            <div
              role="status"
              aria-live="polite"
              className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface-muted p-5"
            >
              {publicTrackerQuery.isPending ? (
                <div className="space-y-2 py-8 text-center">
                  <p className="text-sm font-semibold text-ui-text">
                    Looking up order {activeQueueNumber}…
                  </p>
                  <p className="text-xs text-ui-text-muted">
                    Fetching live kitchen progress from Chino Roces.
                  </p>
                </div>
              ) : publicTrackerQuery.isError || !publicTrackedOrder ? (
                <div role="alert" className="space-y-3 py-4 text-center">
                  <p className="text-sm font-semibold text-ui-error">
                    Order {activeQueueNumber} could not be found.
                  </p>
                  <p className="text-xs text-ui-text-muted">
                    {getApiErrorMessage(
                      publicTrackerQuery.error,
                      'Check your queue number on your receipt (for example #8B-101) and try again.',
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      dismissLastOrder();
                      setQueueLookupError(null);
                    }}
                    className="rounded-xl bg-ui-accent px-4 py-2 text-xs font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
                  >
                    Try Another Queue Number
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-dashed border-ui-border pb-3">
                    <div>
                      <p
                        className={`text-xs font-semibold uppercase ${
                          publicTrackedOrder.status === 'cancelled'
                            ? 'text-ui-error'
                            : 'text-ui-accent'
                        }`}
                      >
                        {publicTrackedOrder.status === 'cancelled'
                          ? 'Order Cancelled'
                          : 'Live Order Tracker'}
                      </p>
                      <h3
                        ref={receiptHeadingRef}
                        tabIndex={-1}
                        className="mt-0.5 text-2xl font-bold text-ui-text tabular-nums focus:outline-none"
                      >
                        {publicTrackedOrder.queueNumber}
                      </h3>
                    </div>
                    <span className="rounded-lg bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text">
                      {publicTrackedOrder.fulfillment === 'kiosk-pickup'
                        ? 'Chino Roces Pickup'
                        : 'Delivery'}
                    </span>
                  </div>

                  <KitchenProgressTracker
                    status={publicTrackedOrder.status}
                    fulfillment={publicTrackedOrder.fulfillment}
                    deliveryEtaMinutes={publicTrackedOrder.deliveryEtaMinutes}
                  />

                  <div className="space-y-1 text-xs text-ui-text-muted">
                    <div className="flex items-center justify-between gap-2">
                      <p>
                        <span className="font-semibold text-ui-text">Status:</span>{' '}
                        <span>{RECEIPT_STATUS_LABELS[publicTrackedOrder.status]}</span>
                      </p>
                      {publicTrackedOrder.status !== 'completed' &&
                      publicTrackedOrder.status !== 'cancelled' ? (
                        <button
                          type="button"
                          disabled={publicTrackerQuery.isFetching}
                          onClick={() => void publicTrackerQuery.refetch()}
                          className="rounded-md border border-ui-border bg-ui-surface px-2 py-0.5 text-[11px] font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
                        >
                          {publicTrackerQuery.isFetching ? 'Checking…' : 'Refresh status'}
                        </button>
                      ) : null}
                    </div>
                    {publicTrackedOrder.fulfillment === 'delivery' &&
                    publicTrackedOrder.deliveryEtaMinutes ? (
                      <p>
                        <span className="font-semibold text-ui-text">Estimated delivery:</span>{' '}
                        {publicTrackedOrder.deliveryEtaMinutes}
                      </p>
                    ) : null}
                  </div>

                  <ul className="space-y-2 border-y border-dashed border-ui-border py-3 text-sm">
                    {publicTrackedOrder.lines.map((line) => (
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
                      </li>
                    ))}
                  </ul>

                  {publicTrackedOrder.status === 'received' ? (
                    <div className="space-y-2 rounded-xl border border-ui-border bg-ui-surface p-3">
                      {cancelOrderError ? (
                        <p role="alert" className="text-xs font-semibold text-ui-error">
                          {cancelOrderError}
                        </p>
                      ) : null}
                      {confirmCancelOrder ? (
                        <form
                          noValidate
                          onSubmit={(event) => void handleConfirmPublicQueueCancel(event)}
                          className="space-y-2.5"
                        >
                          <label
                            htmlFor="cancel-verify-input"
                            className="block text-xs font-semibold text-ui-text"
                          >
                            {publicTrackedOrder.fulfillment === 'delivery'
                              ? 'Confirm Mobile Number on Order'
                              : 'Confirm Customer Name on Order'}
                          </label>
                          <input
                            id="cancel-verify-input"
                            type={publicTrackedOrder.fulfillment === 'delivery' ? 'tel' : 'text'}
                            value={cancelVerificationInput}
                            onChange={(event) => {
                              setCancelVerificationInput(event.target.value);
                              if (cancelOrderError) setCancelOrderError(null);
                            }}
                            placeholder={
                              publicTrackedOrder.fulfillment === 'delivery'
                                ? '0917 000 0000'
                                : 'e.g. Marco'
                            }
                            className="w-full rounded-lg border border-ui-border bg-ui-canvas px-3 py-1.5 text-xs text-ui-text"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="submit"
                              disabled={cancelByQueueMutation.isPending}
                              className="rounded-lg bg-ui-error px-3 py-1.5 text-xs font-semibold text-ui-on-error hover:opacity-90 disabled:opacity-50"
                            >
                              {cancelByQueueMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              disabled={cancelByQueueMutation.isPending}
                              onClick={() => {
                                setConfirmCancelOrder(false);
                                setCancelVerificationInput('');
                                setCancelOrderError(null);
                              }}
                              className="rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                            >
                              Keep Order
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-ui-text-muted">
                            Need to cancel before grilling starts?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmCancelOrder(true);
                              setCancelOrderError(null);
                            }}
                            className="shrink-0 rounded-lg border border-ui-error/40 bg-ui-error/10 px-2.5 py-1 text-xs font-semibold text-ui-error hover:bg-ui-error/20"
                          >
                            Cancel Order
                          </button>
                        </div>
                      )}
                    </div>
                  ) : publicTrackedOrder.status === 'grilling' ||
                    publicTrackedOrder.status === 'ready' ? (
                    <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                      This order is already being prepared in the kitchen and can no longer be
                      cancelled online.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setConfirmCancelOrder(false);
                      setCancelVerificationInput('');
                      setCancelOrderError(null);
                      dismissLastOrder();
                      handleClose();
                    }}
                    className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
                  >
                    Done · Back to Menu
                  </button>
                </>
              )}
            </div>
          ) : cartLines.length > 0 && catalogQuery.isPending ? (
            <div
              role="status"
              className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center"
            >
              <p className="text-base font-semibold text-ui-text">Loading your bag…</p>
              <p className="max-w-xs text-sm text-ui-text-muted">
                Checking latest menu prices and stock availability.
              </p>
            </div>
          ) : cartLines.length > 0 && catalogQuery.isError ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center"
            >
              <p className="text-base font-semibold text-ui-text">
                Unable to load menu details for your saved bag.
              </p>
              <p className="max-w-xs text-sm text-ui-text-muted">
                {getApiErrorMessage(
                  catalogQuery.error,
                  'Check your connection and retry to review your cart.',
                )}
              </p>
              <button
                type="button"
                onClick={() => void catalogQuery.refetch()}
                className="mt-2 rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
              >
                Retry loading menu
              </button>
            </div>
          ) : cartSummary.lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
              {removedNotice ? (
                <div
                  role="status"
                  className="mb-2 w-full rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs text-ui-text"
                >
                  {removedNotice}
                </div>
              ) : null}
              <p className="text-base font-semibold text-ui-text">Your cart is empty.</p>
              <p className="max-w-xs text-sm text-ui-text-muted">
                Add a 100g pure beef burger, crinkle fries, or nachos from the Chino Roces menu to
                start an order.
              </p>

              <form
                noValidate
                onSubmit={handleQueueLookupSubmit}
                className="mt-2 w-full max-w-xs space-y-2 rounded-2xl border border-ui-border bg-ui-surface-muted p-3 text-left"
              >
                <label
                  htmlFor="track-order-queue-input"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Track an existing order
                </label>
                <div className="flex gap-2">
                  <input
                    id="track-order-queue-input"
                    type="text"
                    maxLength={20}
                    value={queueLookupInput}
                    onChange={(event) => {
                      setQueueLookupInput(event.target.value);
                      if (queueLookupError) setQueueLookupError(null);
                    }}
                    placeholder="e.g. #8B-101 or 101"
                    className="min-w-0 flex-1 rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-xs text-ui-text"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                  >
                    Track Order
                  </button>
                </div>
                {queueLookupError ? (
                  <p role="alert" className="text-xs font-semibold text-ui-error">
                    {queueLookupError}
                  </p>
                ) : null}
              </form>

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
              {removedNotice ? (
                <div
                  role="status"
                  className="flex items-center justify-between gap-2 rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs text-ui-text"
                >
                  <span>{removedNotice}</span>
                  <button
                    type="button"
                    onClick={() => setRemovedNotice(null)}
                    className="shrink-0 font-medium text-ui-text-muted underline hover:text-ui-text"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

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
                        setSubmitError(null);
                      }}
                      className="rounded-md bg-ui-error px-2.5 py-1 text-xs font-semibold text-ui-on-error hover:opacity-90"
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

              {hasUnavailableItems ? (
                <p
                  role="alert"
                  className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-semibold text-ui-error"
                >
                  Some items in your bag are now sold out. Remove unavailable items before placing
                  your order.
                </p>
              ) : null}

              {hasTooManyLines ? (
                <p
                  role="alert"
                  className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-semibold text-ui-error"
                >
                  Orders are limited to 50 distinct items. Remove extra items before placing your
                  order.
                </p>
              ) : null}

              <ul className="space-y-3">
                {cartSummary.lines.map((line) => (
                  <li
                    key={line.lineId}
                    className={`flex gap-3 rounded-2xl border p-3 ${
                      line.item.available
                        ? 'border-ui-border bg-ui-surface-muted'
                        : 'border-ui-error/50 bg-ui-error/5'
                    }`}
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
                          {!line.item.available ? (
                            <p className="text-xs font-semibold text-ui-error">Sold out</p>
                          ) : line.addons.length > 0 ? (
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
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center rounded-lg border border-ui-border bg-ui-surface">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${line.item.name}`}
                              onClick={() => {
                                setSubmitError(null);
                                setLineQuantity(line.lineId, line.quantity - 1);
                              }}
                              className="px-2.5 py-1 text-sm font-bold text-ui-text hover:bg-ui-surface-muted"
                            >
                              -
                            </button>
                            <span className="min-w-7 text-center text-xs font-semibold tabular-nums">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={!line.item.available || line.quantity >= 50}
                              aria-label={`Increase quantity of ${line.item.name}`}
                              onClick={() => {
                                setSubmitError(null);
                                setLineQuantity(line.lineId, line.quantity + 1);
                              }}
                              className="px-2.5 py-1 text-sm font-bold text-ui-text hover:bg-ui-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                          {line.quantity >= 50 ? (
                            <span className="text-[11px] text-ui-text-muted">Max 50</span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          aria-label={`Remove ${line.item.name} from cart`}
                          onClick={() => {
                            setSubmitError(null);
                            removeCartLine(line.lineId);
                          }}
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
                onSubmit={(event) => void handleCheckoutSubmit(event)}
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
                      maxLength={120}
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
                      {fulfillment === 'delivery' ? 'Mobile Number' : 'Mobile (optional)'}
                    </label>
                    <input
                      ref={contactInputRef}
                      id="checkout-contact"
                      name="contactNumber"
                      type="tel"
                      maxLength={40}
                      value={contactNumber}
                      aria-invalid={Boolean(fieldErrors.contactNumber)}
                      aria-describedby={fieldErrors.contactNumber ? contactErrorId : undefined}
                      onChange={(event) => {
                        setContactNumber(event.target.value);
                        if (fieldErrors.contactNumber && event.target.value.trim()) {
                          setFieldErrors((prev) => ({ ...prev, contactNumber: undefined }));
                        }
                      }}
                      placeholder="0917 000 0000"
                      className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                        fieldErrors.contactNumber ? 'border-ui-error' : 'border-ui-border'
                      }`}
                    />
                    {fieldErrors.contactNumber ? (
                      <p
                        id={contactErrorId}
                        role="alert"
                        className="mt-1 text-xs font-semibold text-ui-error"
                      >
                        {fieldErrors.contactNumber}
                      </p>
                    ) : null}
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
                            setDeliveryPin(null);
                            setSelectedAddress(null);
                            setSubmitError(null);
                            setFieldErrors((prev) => ({
                              ...prev,
                              contactNumber: undefined,
                              deliveryPin: undefined,
                              addressOrNotes: undefined,
                            }));
                          }}
                          className="accent-ui-accent"
                        />
                        Kiosk Pickup
                      </span>
                      <span>Free</span>
                    </label>

                    <label
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                        !isDeliveryEnabled
                          ? 'cursor-not-allowed border-ui-border bg-ui-surface text-ui-text-muted opacity-60'
                          : fulfillment === 'delivery'
                            ? 'cursor-pointer border-ui-accent bg-ui-surface-muted font-semibold text-ui-text'
                            : 'cursor-pointer border-ui-border bg-ui-surface text-ui-text-muted'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="fulfillment"
                          disabled={!isDeliveryEnabled}
                          checked={fulfillment === 'delivery'}
                          onChange={() => {
                            setFulfillment('delivery');
                            setSubmitError(null);
                          }}
                          className="accent-ui-accent"
                        />
                        Delivery
                      </span>
                      <span className="tabular-nums">{deliveryOptionBadge}</span>
                    </label>
                  </div>
                </fieldset>

                {fulfillment === 'delivery' ? (
                  !isDeliveryEnabled ? (
                    <p
                      role="alert"
                      className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-medium text-ui-error"
                    >
                      Delivery is temporarily paused. Switch to Kiosk Pickup to place your order.
                    </p>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-ui-border bg-ui-surface-muted p-3">
                      <DeliveryLocationPicker
                        inputRef={locationInputRef}
                        selectedAddress={selectedAddress}
                        pin={deliveryPin}
                        outOfRange={isOutOfRange}
                        distanceKm={deliveryQuote.distanceKm}
                        errorText={fieldErrors.deliveryPin}
                        errorId={locationErrorId}
                        onSelectLocation={handleSelectLocation}
                        onClearLocation={handleClearLocation}
                      />

                      <div role="status" aria-live="polite" aria-atomic="true">
                        {isQuoteResolved ? (
                          <div className="rounded-lg border border-ui-border bg-ui-surface px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-ui-text">
                                {deliveryQuote.etaMinutes
                                  ? `Estimated delivery · ${deliveryQuote.etaMinutes}`
                                  : 'Estimated delivery'}
                              </span>
                              <span className="font-bold text-ui-accent tabular-nums">
                                {deliveryQuote.isFreeDelivery || deliveryQuote.feePhp === 0
                                  ? 'Free'
                                  : formatPhp(deliveryQuote.feePhp)}
                              </span>
                            </div>
                            {typeof deliveryQuote.distanceKm === 'number' ? (
                              <p className="mt-0.5 text-ui-text-muted tabular-nums">
                                ~{deliveryQuote.distanceKm.toFixed(1)} km from Chino Roces ·{' '}
                                {formatPhp(deliveryQuote.baseFeePhp)} base +{' '}
                                {formatPhp(deliveryQuote.perKmRatePhp)}/km
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {isOutOfRange ? (
                        <div
                          role="alert"
                          className="space-y-2 rounded-lg border border-ui-error/40 bg-ui-surface px-3 py-2 text-xs text-ui-error"
                        >
                          <p className="font-semibold">Outside delivery area</p>
                          <p className="tabular-nums">
                            Selected location is ~{deliveryQuote.distanceKm?.toFixed(1)} km away
                            (max coverage: {deliveryQuote.maxDeliveryDistanceKm} km from Chino
                            Roces). Search another Metro Manila address or switch to Kiosk Pickup.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              handleClearLocation();
                              locationInputRef.current?.focus();
                            }}
                            className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                          >
                            Search another address
                          </button>
                        </div>
                      ) : null}

                      {deliveryQuote.freeDeliveryMinSubtotalPhp !== null && !isOutOfRange ? (
                        <div className="space-y-1.5 border-t border-ui-border pt-2">
                          <div className="flex items-center justify-between text-xs">
                            {deliveryQuote.isFreeDelivery ||
                            cartSummary.subtotalPhp >= deliveryQuote.freeDeliveryMinSubtotalPhp ? (
                              <span className="font-semibold text-ui-accent">
                                Free delivery unlocked (
                                {formatPhp(deliveryQuote.freeDeliveryMinSubtotalPhp)}+ order)
                              </span>
                            ) : deliveryQuote.amountToFreeDeliveryPhp !== null ? (
                              <span className="text-ui-text-muted tabular-nums">
                                Add{' '}
                                <span className="font-semibold text-ui-text">
                                  {formatPhp(deliveryQuote.amountToFreeDeliveryPhp)}
                                </span>{' '}
                                more for free delivery (min.{' '}
                                {formatPhp(deliveryQuote.freeDeliveryMinSubtotalPhp)})
                              </span>
                            ) : null}
                          </div>
                          <div
                            aria-hidden="true"
                            className="h-1.5 w-full overflow-hidden rounded-full bg-ui-surface"
                          >
                            <div
                              className="h-full rounded-full bg-ui-accent transition-all motion-reduce:transition-none"
                              style={{ width: `${freeDeliveryProgressPct}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                ) : null}

                <div>
                  <label
                    htmlFor="checkout-notes"
                    className="block text-xs font-semibold text-ui-text"
                  >
                    {fulfillment === 'delivery'
                      ? selectedAddress
                        ? 'Building, Unit & Rider Notes (optional)'
                        : 'Street, Building & Rider Notes'
                      : 'Pickup Notes (optional)'}
                  </label>
                  <input
                    ref={notesInputRef}
                    id="checkout-notes"
                    name="addressOrNotes"
                    type="text"
                    maxLength={500}
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
                      fulfillment === 'delivery'
                        ? selectedAddress
                          ? 'e.g. Tower 2 Unit 14B, leave at lobby'
                          : 'Building, unit, street, barangay / city'
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

                {submitError ? (
                  <div
                    role="alert"
                    className="space-y-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2.5 text-xs text-ui-error"
                  >
                    <p className="font-semibold">{submitError}</p>
                    {fulfillment === 'delivery' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFulfillment('kiosk-pickup');
                          setSubmitError(null);
                          setFieldErrors((prev) => ({
                            ...prev,
                            contactNumber: undefined,
                            deliveryPin: undefined,
                            addressOrNotes: undefined,
                          }));
                        }}
                        className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                      >
                        Switch to Chino Roces Pickup
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1 rounded-xl border border-ui-border bg-ui-surface-muted p-3 text-sm tabular-nums">
                  <div className="flex justify-between text-ui-text-muted">
                    <span>Subtotal</span>
                    <span>{formatPhp(cartSummary.subtotalPhp)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-ui-text-muted">
                    <span className="truncate">Delivery fee</span>
                    <span className="shrink-0">
                      {fulfillment !== 'delivery' ? (
                        'Free'
                      ) : !isDeliveryEnabled ? (
                        'Paused'
                      ) : isOutOfRange ? (
                        'Out of range'
                      ) : !isQuoteResolved ? (
                        'Enter address'
                      ) : deliveryQuote.isFreeDelivery ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="line-through opacity-70">
                            {formatPhp(deliveryQuote.subtotalFeePhp)}
                          </span>
                          <span className="font-semibold text-ui-accent">Free</span>
                        </span>
                      ) : deliveryFeePhp > 0 ? (
                        formatPhp(deliveryFeePhp)
                      ) : (
                        'Free'
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-ui-border pt-1.5 text-base font-bold text-ui-text">
                    <span>Total</span>
                    <span className="text-ui-accent">{formatPhp(grandTotalPhp)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCheckoutDisabled}
                  className="w-full rounded-xl bg-ui-accent px-4 py-3 text-sm font-bold text-ui-on-accent tabular-nums hover:bg-ui-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {placeOrderMutation.isPending
                    ? 'Submitting Order…'
                    : `Buy Order · ${formatPhp(grandTotalPhp)}`}
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

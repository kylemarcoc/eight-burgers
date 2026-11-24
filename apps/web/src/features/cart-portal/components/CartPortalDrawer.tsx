import {
  DEFAULT_STORE_PROFILE,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_VALUES,
  PAYMENT_REFERENCE_MAX_LENGTH,
  PAYMENT_STATUS_LABELS,
  TABLE_NUMBER_MAX_LENGTH,
  canCustomerCancelOrder,
  normalizeQueueNumber,
  type PaymentMethodConfig,
  type PaymentStatus,
  type PublicOrderTracker,
} from '@menu-kiosk/contracts';
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type SubmitEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ItemCustomizerModal,
  preloadItemCustomizerModal,
  useCatalogQuery,
} from '@/features/menu-catalog';
import {
  useCancelOrderByQueueMutation,
  useCancelOrderByReceiptMutation,
  usePlaceOrderMutation,
  usePublicOrderTrackerQuery,
  useSubmitPaymentReferenceMutation,
} from '@/features/orders';
import { FoodImage } from '@/shared/components/FoodImage';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import {
  acquireOverlayLock,
  getTopmostOverlayId,
  subscribeOverlayLocks,
} from '@/shared/lib/overlay-lock';
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
  useDineInTable,
  useLastPlacedOrder,
  usePrunedRemovedCount,
} from '@/shared/store/useCartStore';
import { useCartLifecycle } from '../hooks/useCartLifecycle';
import { useResolvedCartSummary } from '../hooks/useResolvedCartSummary';
import { DeliveryLocationPicker } from './DeliveryLocationPicker';

const EMPTY_DELIVERY_PRICING: DeliveryPricingConfig = {
  deliveryEnabled: false,
  baseFeePhp: 0,
  perKmRatePhp: 0,
  maxDistanceKm: 25,
  freeDeliveryMinSubtotalPhp: null,
  originCoords: null,
};

function getReceiptStatusLabel(status: OrderStatus, preparingStageLabel: string): string {
  switch (status) {
    case 'received':
      return 'Received';
    case 'preparing':
      return preparingStageLabel || 'Preparing';
    case 'ready':
      return 'Ready for Pickup / Dispatch';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
}

function getFulfillmentBadgeLabel(
  fulfillment: FulfillmentMode,
  pickupLabel: string,
  tableNumber?: string,
): string {
  if (fulfillment === 'delivery') return 'Delivery';
  if (fulfillment === 'dine-in') {
    const trimmed = tableNumber?.trim();
    return trimmed ? `Dine-in · Table ${trimmed}` : 'Dine-in';
  }
  return pickupLabel;
}

function getPaymentStatusBadgeClasses(paymentStatus: PaymentStatus): string {
  switch (paymentStatus) {
    case 'paid':
      return 'border-ui-accent/50 bg-ui-surface text-ui-accent';
    case 'pending_verification':
      return 'border-ui-accent bg-ui-accent text-ui-on-accent';
    case 'unpaid':
      return 'border-ui-border bg-ui-surface text-ui-text-muted';
  }
}

const PROGRESS_STAGE_ORDER: readonly Exclude<OrderStatus, 'cancelled'>[] = [
  'received',
  'preparing',
  'ready',
  'completed',
];

function KitchenProgressTracker({
  status,
  fulfillment,
  tableNumber,
  deliveryEtaMinutes,
  preparingStageLabel,
  pickupSpotLabel,
}: {
  status: OrderStatus;
  fulfillment: FulfillmentMode;
  tableNumber?: string;
  deliveryEtaMinutes?: string;
  preparingStageLabel: string;
  pickupSpotLabel: string;
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
  const trimmedTable = tableNumber?.trim();
  const readyLabel =
    fulfillment === 'pickup'
      ? 'Ready at Counter'
      : fulfillment === 'dine-in'
        ? 'Ready to Serve'
        : 'Out for Delivery';
  const readyDetail =
    fulfillment === 'pickup'
      ? `Pick up at ${pickupSpotLabel}`
      : fulfillment === 'dine-in'
        ? trimmedTable
          ? `Serving to Table ${trimmedTable}`
          : 'Serving to your table'
        : deliveryEtaMinutes
          ? `Estimated ${deliveryEtaMinutes}`
          : 'Ready for rider dispatch';

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
      key: 'preparing',
      label: preparingStageLabel || 'Preparing',
      detail: 'Your order is being freshly prepared',
    },
    {
      key: 'ready',
      label: readyLabel,
      detail: readyDetail,
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
        <span className="font-medium text-ui-accent">
          {getReceiptStatusLabel(status, preparingStageLabel)}
        </span>
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

function PaymentInstructionsCard({
  method,
  config,
  storeName,
  contactPhone,
}: {
  method: PaymentMethod;
  config: PaymentMethodConfig;
  storeName: string;
  contactPhone: string;
}) {
  const [accountCopyState, setAccountCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const displayLabel = config.label || PAYMENT_METHOD_LABELS[method];
  const hasDetails = Boolean(
    config.accountName || config.accountNumber || config.instructions || config.qrImageUrl,
  );

  function handleCopyAccount() {
    if (!config.accountNumber) return;
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setAccountCopyState('failed');
      return;
    }
    void navigator.clipboard
      .writeText(config.accountNumber)
      .then(() => setAccountCopyState('copied'))
      .catch(() => setAccountCopyState('failed'));
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-ui-border bg-ui-surface p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ui-text">{displayLabel} payment details</span>
        {config.accountNumber ? (
          <button
            type="button"
            onClick={handleCopyAccount}
            className="rounded-md border border-ui-border bg-ui-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ui-text hover:bg-ui-canvas"
          >
            {accountCopyState === 'copied'
              ? 'Copied'
              : accountCopyState === 'failed'
                ? 'Copy unavailable'
                : 'Copy number'}
          </button>
        ) : null}
      </div>

      {hasDetails ? (
        <div className="space-y-2">
          {config.accountName || config.accountNumber ? (
            <div className="space-y-0.5 text-ui-text-muted">
              {config.accountName ? (
                <p>
                  <span className="font-semibold text-ui-text">Account name:</span>{' '}
                  {config.accountName}
                </p>
              ) : null}
              {config.accountNumber ? (
                <p>
                  <span className="font-semibold text-ui-text">Account number:</span>{' '}
                  <span className="font-mono text-ui-text">{config.accountNumber}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {config.instructions ? <p className="text-ui-text-muted">{config.instructions}</p> : null}

          {config.qrImageUrl ? (
            <div className="flex justify-center rounded-xl border border-ui-border bg-white p-2.5">
              <img
                src={config.qrImageUrl}
                alt={`${displayLabel} QR code`}
                className="max-h-48 w-auto object-contain"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-ui-text-muted">
          Confirm {displayLabel} payment details with {storeName}
          {contactPhone ? ` (${contactPhone})` : ''} when sending your payment.
        </p>
      )}
    </div>
  );
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function buildSmsOrderHref(contact: string, body: string): string {
  const digits = contact.replace(/[^0-9+]/g, '');
  return `sms:${digits}?body=${encodeURIComponent(body)}`;
}

type CheckoutFieldErrors = {
  customerName?: string;
  contactNumber?: string;
  tableNumber?: string;
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

function getServerTopmostOverlayId(): symbol | string | null {
  return null;
}

export function CartPortalDrawer() {
  const catalogQuery = useCatalogQuery();
  const cartLines = useCartLines();
  const cartSummary = useResolvedCartSummary();
  const isCartOpen = useCartOpen();
  const prunedRemovedCount = usePrunedRemovedCount();
  const lastPlacedOrderState = useLastPlacedOrder();
  const dineInTable = useDineInTable();
  const {
    setCartOpen,
    updateCartLine,
    setLineQuantity,
    removeCartLine,
    clearPrunedRemovedCount,
    clearCart,
    setLastPlacedOrder,
    setTrackedQueueNumber,
    clearDineInTable,
    dismissLastOrder,
  } = useCartActions();

  const optionGroups = useMemo(
    () => catalogQuery.data?.optionGroups ?? [],
    [catalogQuery.data?.optionGroups],
  );
  const [editingCartLineId, setEditingCartLineId] = useState<string | null>(null);
  const editingCartLine = useMemo(
    () =>
      editingCartLineId
        ? (cartSummary.lines.find((line) => line.lineId === editingCartLineId) ?? null)
        : null,
    [editingCartLineId, cartSummary.lines],
  );

  const store = catalogQuery.data?.store ?? DEFAULT_STORE_PROFILE;
  const pickupLabel = store.pickupSpotLabel || 'Counter Pickup';
  const preparingLabel = store.preparingStageLabel || 'Preparing';
  const originLabel = store.branchLabel || store.storeName;
  const isStorePaused = catalogQuery.isSuccess && !store.acceptingOrders;
  const primaryExternalLink = store.externalLinks[0] ?? null;
  const deliveryPricing = catalogQuery.data?.deliveryPricing ?? EMPTY_DELIVERY_PRICING;
  const hasOriginPin = isValidCoordinates(deliveryPricing.originCoords);
  const isPickupEnabled = store.pickupEnabled;
  const isDeliveryEnabled =
    store.deliveryEnabled && deliveryPricing.deliveryEnabled && hasOriginPin;
  const isDineInEnabled = store.dineInEnabled;

  const enabledFulfillmentModes = useMemo<FulfillmentMode[]>(() => {
    const modes: FulfillmentMode[] = [];
    if (isPickupEnabled) modes.push('pickup');
    if (isDeliveryEnabled) modes.push('delivery');
    if (isDineInEnabled) modes.push('dine-in');
    return modes;
  }, [isPickupEnabled, isDeliveryEnabled, isDineInEnabled]);

  const enabledPaymentMethods = useMemo<PaymentMethod[]>(
    () => PAYMENT_METHOD_VALUES.filter((method) => store.paymentMethods[method].enabled),
    [store.paymentMethods],
  );

  const { activeReceiptToken, activeQueueNumber, hasMatchingReceiptSession, liveReceiptQuery } =
    useCartLifecycle(true);

  const placeOrderMutation = usePlaceOrderMutation();
  const submitPaymentReferenceMutation = useSubmitPaymentReferenceMutation();
  const cancelByReceiptMutation = useCancelOrderByReceiptMutation();
  const cancelByQueueMutation = useCancelOrderByQueueMutation();

  const publicTrackerQuery = usePublicOrderTrackerQuery(
    activeQueueNumber,
    Boolean(activeQueueNumber && !hasMatchingReceiptSession),
  );

  const lastPlacedOrder = hasMatchingReceiptSession
    ? (liveReceiptQuery.data ?? lastPlacedOrderState?.order ?? null)
    : null;
  const isHydratingReceiptSession = Boolean(
    hasMatchingReceiptSession && !lastPlacedOrder && liveReceiptQuery.isPending,
  );
  const publicTrackedOrder: PublicOrderTracker | null = !hasMatchingReceiptSession
    ? (publicTrackerQuery.data ?? null)
    : null;
  const hasTrackedOrderContext = Boolean(
    lastPlacedOrder || isHydratingReceiptSession || activeQueueNumber,
  );

  const [drawerTab, setDrawerTab] = useState<'bag' | 'tracker'>('bag');
  const [queueLookupInput, setQueueLookupInput] = useState('');
  const [queueLookupError, setQueueLookupError] = useState<string | null>(null);
  const [confirmCancelOrder, setConfirmCancelOrder] = useState(false);
  const [cancelVerificationInput, setCancelVerificationInput] = useState('');
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null);

  const [receiptRefDraft, setReceiptRefDraft] = useState<string | null>(null);
  const [receiptRefError, setReceiptRefError] = useState<string | null>(null);
  const [receiptRefSuccess, setReceiptRefSuccess] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [selectedFulfillment, setSelectedFulfillment] = useState<FulfillmentMode | null>(null);
  const [tableNumberDraft, setTableNumberDraft] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [deliveryPin, setDeliveryPin] = useState<GeoCoordinates | null>(null);
  const [addressOrNotes, setAddressOrNotes] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');
  const [checkoutPaymentRef, setCheckoutPaymentRef] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const removedNotice =
    prunedRemovedCount > 0
      ? `Removed ${prunedRemovedCount} ${
          prunedRemovedCount === 1 ? 'item' : 'items'
        } from your bag that ${prunedRemovedCount === 1 ? 'is' : 'are'} no longer on the menu.`
      : null;

  const fulfillment: FulfillmentMode = useMemo(() => {
    if (selectedFulfillment) {
      if (selectedFulfillment === 'delivery') {
        return 'delivery';
      }
      if (enabledFulfillmentModes.includes(selectedFulfillment)) {
        return selectedFulfillment;
      }
    }
    if (dineInTable && isDineInEnabled) {
      return 'dine-in';
    }
    return enabledFulfillmentModes[0] ?? 'pickup';
  }, [selectedFulfillment, enabledFulfillmentModes, dineInTable, isDineInEnabled]);

  const paymentMethod: PaymentMethod = enabledPaymentMethods.includes(selectedPaymentMethod)
    ? selectedPaymentMethod
    : (enabledPaymentMethods[0] ?? 'cash');

  const effectiveTableNumber = tableNumberDraft !== null ? tableNumberDraft : (dineInTable ?? '');

  const titleId = useId();
  const overlayId = useId();
  const nameErrorId = useId();
  const contactErrorId = useId();
  const tableErrorId = useId();
  const locationErrorId = useId();
  const addressErrorId = useId();

  const topmostOverlayId = useSyncExternalStore(
    subscribeOverlayLocks,
    getTopmostOverlayId,
    getServerTopmostOverlayId,
  );
  const isOverlayTopmost = isCartOpen && topmostOverlayId === overlayId;

  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const contactInputRef = useRef<HTMLInputElement | null>(null);
  const tableInputRef = useRef<HTMLInputElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const notesInputRef = useRef<HTMLInputElement | null>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusedReceiptKeyRef = useRef<string | null>(null);

  const hasDeliveryPin = fulfillment === 'delivery' && isValidCoordinates(deliveryPin);

  const deliveryQuote = useMemo(
    () =>
      calculateDeliveryQuote({
        fulfillment,
        subtotalPhp: cartSummary.subtotalPhp,
        deliveryPricing,
        pin: hasDeliveryPin ? deliveryPin : null,
        storeOrigin: deliveryPricing.originCoords,
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
        tableNumber: fulfillment === 'dine-in' ? effectiveTableNumber.trim() : '',
        deliveryPin: hasDeliveryPin ? deliveryPin : null,
        selectedAddress: fulfillment === 'delivery' ? (selectedAddress ?? null) : null,
        customerName: customerName.trim(),
        contactNumber: contactNumber.trim(),
        addressOrNotes: addressOrNotes.trim(),
        paymentMethod,
        paymentReference: paymentMethod !== 'cash' ? checkoutPaymentRef.trim() : '',
      }),
    [
      cartLines,
      fulfillment,
      effectiveTableNumber,
      hasDeliveryPin,
      deliveryPin,
      selectedAddress,
      customerName,
      contactNumber,
      addressOrNotes,
      paymentMethod,
      checkoutPaymentRef,
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
    setReceiptRefError(null);
    setReceiptRefSuccess(null);
    setQueueLookupError(null);
    setCopyStatus('idle');
    setSubmitError(null);
    clearPrunedRemovedCount();
    setCartOpen(false);
  }, [clearPrunedRemovedCount, setCartOpen]);

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

    const portalNode = portalRootRef.current;
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousFocusRef.current =
      activeElement &&
      (!portalNode || !portalNode.contains(activeElement)) &&
      !activeElement.closest('[data-api-loading-backdrop]')
        ? activeElement
        : null;

    const overlayLock = acquireOverlayLock(portalNode, { id: overlayId });

    if (overlayLock.isTopmost()) {
      closeButtonRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!overlayLock.isTopmost()) {
        return;
      }
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
      focusedReceiptKeyRef.current = null;
      overlayLock.release();

      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus && previousFocus.isConnected && !previousFocus.closest('[inert]')) {
        previousFocus.focus();
      }
    };
  }, [isCartOpen, handleClose, overlayId]);

  const activeReceiptKey =
    lastPlacedOrder && cartSummary.lines.length === 0 && cartLines.length === 0
      ? lastPlacedOrder.id
      : null;

  useEffect(() => {
    if (!isCartOpen || !isOverlayTopmost) return;

    if (activeReceiptKey) {
      if (
        focusedReceiptKeyRef.current !== activeReceiptKey &&
        receiptHeadingRef.current &&
        !receiptHeadingRef.current.closest('[inert]')
      ) {
        focusedReceiptKeyRef.current = activeReceiptKey;
        receiptHeadingRef.current.focus();
        return;
      }
    } else {
      focusedReceiptKeyRef.current = null;
    }

    const portalNode = portalRootRef.current;
    const activeElement = document.activeElement;
    if (
      portalNode &&
      (!activeElement || activeElement === document.body || !portalNode.contains(activeElement))
    ) {
      (receiptHeadingRef.current ?? closeButtonRef.current ?? dialogRef.current)?.focus();
    }
  }, [isCartOpen, isOverlayTopmost, activeReceiptKey]);

  if (!isCartOpen) return null;

  const hasUnavailableItems = cartSummary.unavailableLineIds.length > 0;
  const hasInvalidOptions = cartSummary.invalidOptionLineIds.length > 0;
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
    isStorePaused ||
    isDeliveryBlocked ||
    hasUnavailableItems ||
    hasInvalidOptions ||
    hasTooManyLines ||
    enabledFulfillmentModes.length === 0 ||
    enabledPaymentMethods.length === 0 ||
    placeOrderMutation.isPending;

  const fallbackFulfillment: FulfillmentMode = isPickupEnabled
    ? 'pickup'
    : isDineInEnabled
      ? 'dine-in'
      : 'pickup';
  const fallbackFulfillmentLabel = fallbackFulfillment === 'dine-in' ? 'Dine-in' : pickupLabel;

  const visibleFulfillmentModes: FulfillmentMode[] = [];
  if (isPickupEnabled) visibleFulfillmentModes.push('pickup');
  if (isDeliveryEnabled || fulfillment === 'delivery') visibleFulfillmentModes.push('delivery');
  if (isDineInEnabled) visibleFulfillmentModes.push('dine-in');

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
    const trimmedTable = effectiveTableNumber.trim();
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
    if (fulfillment === 'dine-in' && store.dineInTableRequired && !trimmedTable) {
      nextErrors.tableNumber = 'Enter your table number so we can serve your order.';
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
      nextErrors.tableNumber ||
      nextErrors.deliveryPin ||
      nextErrors.addressOrNotes
    ) {
      setFieldErrors(nextErrors);
      if (nextErrors.customerName) {
        nameInputRef.current?.focus();
      } else if (nextErrors.contactNumber) {
        contactInputRef.current?.focus();
      } else if (nextErrors.tableNumber) {
        tableInputRef.current?.focus();
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
          tableNumber: fulfillment === 'dine-in' ? trimmedTable : '',
          ...(fulfillment === 'delivery' && deliveryPin ? { deliveryPin } : {}),
          addressOrNotes: composedAddressOrNotes,
          paymentMethod,
          paymentReference: paymentMethod !== 'cash' ? checkoutPaymentRef.trim() : '',
          items: cartSummary.lines.map((line) => ({
            itemId: line.item.id,
            quantity: line.quantity,
            selectedOptionIds: line.selectedOptionIds,
            itemNote: line.itemNote,
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
      setReceiptRefDraft(null);
      setReceiptRefError(null);
      setReceiptRefSuccess(null);
      idempotencyRef.current = { signature: '', key: createIdempotencyKey() };
      setCustomerName('');
      setContactNumber('');
      setAddressOrNotes('');
      setSelectedAddress(null);
      setDeliveryPin(null);
      setCheckoutPaymentRef('');
      setTableNumberDraft(null);
    } catch (error) {
      if (isApiError(error) && error.code === 'PRICE_CHANGED') {
        idempotencyRef.current = { signature: '', key: createIdempotencyKey() };
        setSubmitError(
          'Menu or delivery prices just updated. Review your updated total below and submit again.',
        );
      } else if (isApiError(error) && error.code === 'STORE_CLOSED') {
        void catalogQuery.refetch();
        setSubmitError(
          getApiErrorMessage(
            error,
            store.closedNotice || 'Ordering is currently paused. Your bag has been preserved.',
          ),
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
    const trimmedLookup = queueLookupInput.trim();
    const loadedPrefix = catalogQuery.data?.store?.queuePrefix;
    const normalized = loadedPrefix
      ? normalizeQueueNumber(trimmedLookup, loadedPrefix)
      : /^#?\d+$/.test(trimmedLookup)
        ? trimmedLookup.replace(/^#/, '')
        : normalizeQueueNumber(trimmedLookup);
    if (!normalized) {
      setQueueLookupError(
        `Enter your queue number (for example #${store.queuePrefix}-101 or 101).`,
      );
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

  async function handleReceiptPaymentReferenceSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lastPlacedOrder || !activeReceiptToken) return;
    const rawValue = receiptRefDraft !== null ? receiptRefDraft : lastPlacedOrder.paymentReference;
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setReceiptRefError('Enter the payment reference number from your transfer receipt.');
      return;
    }
    setReceiptRefError(null);
    setReceiptRefSuccess(null);
    try {
      const updated = await submitPaymentReferenceMutation.mutateAsync({
        orderId: lastPlacedOrder.id,
        receiptToken: activeReceiptToken,
        paymentReference: trimmed,
      });
      setLastPlacedOrder({
        order: updated,
        receiptToken: activeReceiptToken,
      });
      setReceiptRefDraft(null);
      setReceiptRefSuccess(
        lastPlacedOrder.paymentReference
          ? 'Payment reference updated for cashier review.'
          : 'Payment reference submitted for cashier review.',
      );
    } catch (error) {
      setReceiptRefError(
        getApiErrorMessage(error, 'Could not save your payment reference. Please try again.'),
      );
    }
  }

  async function handleConfirmReceiptCancel() {
    if (!activeReceiptToken || !lastPlacedOrder) return;
    setCancelOrderError(null);
    try {
      const updated = await cancelByReceiptMutation.mutateAsync({
        orderId: lastPlacedOrder.id,
        receiptToken: activeReceiptToken,
      });
      setLastPlacedOrder({
        order: updated,
        receiptToken: activeReceiptToken,
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
      setCancelOrderError('Enter the mobile number used on this order.');
      return;
    }
    setCancelOrderError(null);
    try {
      await cancelByQueueMutation.mutateAsync({
        queueNumber: publicTrackedOrder.queueNumber,
        verification: { contactNumber: trimmed },
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
            <p className="text-xs text-ui-text-muted">{originLabel}</p>
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

          {showTrackerView && isHydratingReceiptSession ? (
            <div
              role="status"
              aria-live="polite"
              className="space-y-2 rounded-2xl border border-ui-border bg-ui-surface-muted p-6 text-center"
            >
              <p className="text-sm font-semibold text-ui-text">
                Loading receipt for {activeQueueNumber ?? 'your order'}…
              </p>
              <p className="text-xs text-ui-text-muted">Restoring your live order details.</p>
            </div>
          ) : showTrackerView && lastPlacedOrder ? (
            <div
              role="status"
              aria-live="polite"
              className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface-muted p-5"
            >
              <div className="flex items-start justify-between gap-2 border-b border-dashed border-ui-border pb-3">
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
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-lg bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text">
                    {getFulfillmentBadgeLabel(
                      lastPlacedOrder.fulfillment,
                      pickupLabel,
                      lastPlacedOrder.tableNumber,
                    )}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getPaymentStatusBadgeClasses(lastPlacedOrder.paymentStatus)}`}
                  >
                    {PAYMENT_STATUS_LABELS[lastPlacedOrder.paymentStatus]}
                  </span>
                </div>
              </div>

              <KitchenProgressTracker
                status={lastPlacedOrder.status}
                fulfillment={lastPlacedOrder.fulfillment}
                tableNumber={lastPlacedOrder.tableNumber}
                deliveryEtaMinutes={lastPlacedOrder.deliveryEtaMinutes}
                preparingStageLabel={preparingLabel}
                pickupSpotLabel={pickupLabel}
              />

              <div className="space-y-1 text-xs text-ui-text-muted">
                <p>
                  <span className="font-semibold text-ui-text">Guest:</span>{' '}
                  {lastPlacedOrder.customerName}
                </p>
                {lastPlacedOrder.fulfillment === 'dine-in' && lastPlacedOrder.tableNumber ? (
                  <p>
                    <span className="font-semibold text-ui-text">Table:</span>{' '}
                    {lastPlacedOrder.tableNumber}
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <p>
                    <span className="font-semibold text-ui-text">Status:</span>{' '}
                    <span>{getReceiptStatusLabel(lastPlacedOrder.status, preparingLabel)}</span>
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
                  {store.paymentMethods[lastPlacedOrder.paymentMethod]?.label ||
                    PAYMENT_METHOD_LABELS[lastPlacedOrder.paymentMethod]}{' '}
                  ({PAYMENT_STATUS_LABELS[lastPlacedOrder.paymentStatus]})
                </p>
                {lastPlacedOrder.paymentReference ? (
                  <p>
                    <span className="font-semibold text-ui-text">Payment ref:</span>{' '}
                    <span className="font-mono text-ui-text">
                      {lastPlacedOrder.paymentReference}
                    </span>
                  </p>
                ) : null}
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
                {lastPlacedOrder.lines.map((line) => {
                  const optionNames =
                    line.selectedOptions && line.selectedOptions.length > 0
                      ? line.selectedOptions.map((option) => option.choiceName)
                      : line.addonNames;
                  const trimmedNote = line.itemNote?.trim();
                  return (
                    <li key={line.lineId} className="flex items-start justify-between gap-2">
                      <span>
                        <span className="font-semibold tabular-nums">{line.quantity}×</span>{' '}
                        {line.name}
                        {optionNames.length > 0 ? (
                          <span className="block text-xs text-ui-text-muted">
                            + {optionNames.join(', ')}
                          </span>
                        ) : null}
                        {trimmedNote ? (
                          <span className="block text-xs font-medium text-ui-accent">
                            Note: {trimmedNote}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatPhp(line.lineTotalPhp)}
                      </span>
                    </li>
                  );
                })}
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
              lastPlacedOrder.status !== 'cancelled' &&
              lastPlacedOrder.paymentStatus !== 'paid' ? (
                <div className="space-y-3">
                  <PaymentInstructionsCard
                    method={lastPlacedOrder.paymentMethod}
                    config={store.paymentMethods[lastPlacedOrder.paymentMethod]}
                    storeName={store.storeName}
                    contactPhone={store.contactPhone}
                  />

                  {activeReceiptToken ? (
                    <form
                      noValidate
                      onSubmit={(event) => void handleReceiptPaymentReferenceSubmit(event)}
                      className="space-y-2 rounded-xl border border-ui-border bg-ui-surface p-3"
                    >
                      <label
                        htmlFor="receipt-payment-reference"
                        className="block text-xs font-semibold text-ui-text"
                      >
                        {lastPlacedOrder.paymentReference
                          ? 'Update payment reference'
                          : 'Submit payment reference'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="receipt-payment-reference"
                          type="text"
                          maxLength={PAYMENT_REFERENCE_MAX_LENGTH}
                          value={
                            receiptRefDraft !== null
                              ? receiptRefDraft
                              : lastPlacedOrder.paymentReference
                          }
                          onChange={(event) => {
                            setReceiptRefDraft(event.target.value);
                            if (receiptRefError) setReceiptRefError(null);
                            if (receiptRefSuccess) setReceiptRefSuccess(null);
                          }}
                          placeholder="e.g. Ref # 1234 5678 9012"
                          className="min-w-0 flex-1 rounded-lg border border-ui-border bg-ui-canvas px-3 py-1.5 font-mono text-xs text-ui-text"
                        />
                        <button
                          type="submit"
                          disabled={submitPaymentReferenceMutation.isPending}
                          className="shrink-0 rounded-lg bg-ui-accent px-3 py-1.5 text-xs font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-50"
                        >
                          {submitPaymentReferenceMutation.isPending
                            ? 'Saving…'
                            : lastPlacedOrder.paymentReference
                              ? 'Update ref'
                              : 'Submit ref'}
                        </button>
                      </div>
                      {receiptRefError ? (
                        <p role="alert" className="text-xs font-semibold text-ui-error">
                          {receiptRefError}
                        </p>
                      ) : null}
                      {receiptRefSuccess ? (
                        <p className="text-xs font-medium text-ui-accent">{receiptRefSuccess}</p>
                      ) : null}
                    </form>
                  ) : null}
                </div>
              ) : null}

              {canCustomerCancelOrder(lastPlacedOrder) && activeReceiptToken ? (
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
                        preparation starts?
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
                        Need to change or cancel before preparation starts?
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
              ) : lastPlacedOrder.status === 'received' &&
                lastPlacedOrder.paymentStatus !== 'unpaid' ? (
                <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                  Online cancellation is unavailable once a payment reference is submitted or
                  payment is confirmed. Please contact {store.storeName} for assistance.
                </p>
              ) : lastPlacedOrder.status === 'preparing' || lastPlacedOrder.status === 'ready' ? (
                <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                  This order is already being prepared in the kitchen and can no longer be cancelled
                  online.
                </p>
              ) : null}

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const summaryText = formatOrderShareText(lastPlacedOrder, {
                      storeName: store.storeName,
                      pickupLabel,
                    });
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
                      ? 'Copy Unavailable'
                      : 'Copy Order Summary'}
                </button>

                {store.contactPhone || primaryExternalLink ? (
                  <div
                    className={`grid gap-2 ${
                      store.contactPhone && primaryExternalLink ? 'grid-cols-2' : 'grid-cols-1'
                    }`}
                  >
                    {store.contactPhone ? (
                      <a
                        href={buildSmsOrderHref(
                          store.contactPhone,
                          formatOrderShareText(lastPlacedOrder, {
                            storeName: store.storeName,
                            pickupLabel,
                          }),
                        )}
                        className="inline-flex items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                      >
                        Send via SMS
                      </a>
                    ) : null}
                    {primaryExternalLink ? (
                      <a
                        href={primaryExternalLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                      >
                        Open {primaryExternalLink.label}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCopyStatus('idle');
                  setConfirmCancelOrder(false);
                  setCancelOrderError(null);
                  setReceiptRefDraft(null);
                  setReceiptRefError(null);
                  setReceiptRefSuccess(null);
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
                  <p className="text-xs text-ui-text-muted">Fetching live kitchen progress.</p>
                </div>
              ) : publicTrackerQuery.isError || !publicTrackedOrder ? (
                <div role="alert" className="space-y-3 py-4 text-center">
                  <p className="text-sm font-semibold text-ui-error">
                    Order {activeQueueNumber} could not be found.
                  </p>
                  <p className="text-xs text-ui-text-muted">
                    {getApiErrorMessage(
                      publicTrackerQuery.error,
                      `Check your queue number on your receipt (for example #${store.queuePrefix}-101) and try again.`,
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
                  <div className="flex items-start justify-between gap-2 border-b border-dashed border-ui-border pb-3">
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
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-lg bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text">
                        {getFulfillmentBadgeLabel(
                          publicTrackedOrder.fulfillment,
                          pickupLabel,
                          publicTrackedOrder.tableNumber,
                        )}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getPaymentStatusBadgeClasses(publicTrackedOrder.paymentStatus)}`}
                      >
                        {PAYMENT_STATUS_LABELS[publicTrackedOrder.paymentStatus]}
                      </span>
                    </div>
                  </div>

                  <KitchenProgressTracker
                    status={publicTrackedOrder.status}
                    fulfillment={publicTrackedOrder.fulfillment}
                    tableNumber={publicTrackedOrder.tableNumber}
                    deliveryEtaMinutes={publicTrackedOrder.deliveryEtaMinutes}
                    preparingStageLabel={preparingLabel}
                    pickupSpotLabel={pickupLabel}
                  />

                  <div className="space-y-1 text-xs text-ui-text-muted">
                    <div className="flex items-center justify-between gap-2">
                      <p>
                        <span className="font-semibold text-ui-text">Status:</span>{' '}
                        <span>
                          {getReceiptStatusLabel(publicTrackedOrder.status, preparingLabel)}
                        </span>
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
                    {publicTrackedOrder.lines.map((line) => {
                      const optionNames =
                        line.selectedOptionNames && line.selectedOptionNames.length > 0
                          ? line.selectedOptionNames
                          : line.addonNames;
                      return (
                        <li key={line.lineId} className="flex items-start justify-between gap-2">
                          <span>
                            <span className="font-semibold tabular-nums">{line.quantity}×</span>{' '}
                            {line.name}
                            {optionNames.length > 0 ? (
                              <span className="block text-xs text-ui-text-muted">
                                + {optionNames.join(', ')}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {canCustomerCancelOrder(publicTrackedOrder) ? (
                    publicTrackedOrder.fulfillment === 'delivery' ||
                    publicTrackedOrder.hasContactNumber ? (
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
                              Confirm Mobile Number on Order
                            </label>
                            <input
                              id="cancel-verify-input"
                              type="tel"
                              value={cancelVerificationInput}
                              onChange={(event) => {
                                setCancelVerificationInput(event.target.value);
                                if (cancelOrderError) setCancelOrderError(null);
                              }}
                              placeholder="0917 000 0000"
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
                              Need to cancel before preparation starts?
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
                    ) : (
                      <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                        This order was placed without a mobile number. Cancel from the device that
                        placed it, or contact {store.storeName} for assistance.
                      </p>
                    )
                  ) : publicTrackedOrder.status === 'received' &&
                    publicTrackedOrder.paymentStatus !== 'unpaid' ? (
                    <p className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text-muted">
                      Online cancellation is unavailable once a payment reference is submitted or
                      payment is confirmed. Please contact {store.storeName} for assistance.
                    </p>
                  ) : publicTrackedOrder.status === 'preparing' ||
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
                Add items from the menu to start an order.
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
                    placeholder={`e.g. #${store.queuePrefix}-101 or 101`}
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
                    onClick={() => clearPrunedRemovedCount()}
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

              {isStorePaused ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3.5 py-2.5 text-xs"
                >
                  <p className="font-bold text-ui-error">Ordering is currently paused</p>
                  <p className="mt-0.5 text-ui-text-muted">
                    {store.closedNotice ||
                      'You can keep editing your bag. Place Order will re-enable once the store resumes.'}
                  </p>
                </div>
              ) : null}

              {hasUnavailableItems ? (
                <p
                  role="alert"
                  className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-semibold text-ui-error"
                >
                  Some items in your bag are now sold out. Remove unavailable items before placing
                  your order.
                </p>
              ) : null}

              {hasInvalidOptions ? (
                <p
                  role="alert"
                  className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-semibold text-ui-error"
                >
                  Some items in your bag have sold-out or invalid options. Use Edit options to
                  update or remove them before placing your order.
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
                      line.item.available && !line.hasInvalidOptions
                        ? 'border-ui-border bg-ui-surface-muted'
                        : 'border-ui-error/50 bg-ui-error/5'
                    }`}
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ui-border bg-ui-surface">
                      <FoodImage
                        src={line.item.imageUrl}
                        alt={line.item.name}
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
                          ) : line.hasInvalidOptions ? (
                            <div className="mt-0.5 space-y-0.5">
                              <span className="inline-block rounded bg-ui-error/15 px-1.5 py-0.5 text-[11px] font-semibold text-ui-error">
                                Options need attention
                              </span>
                              {line.optionIssues[0] ? (
                                <p className="text-xs text-ui-error">
                                  {line.optionIssues[0].message}
                                </p>
                              ) : null}
                            </div>
                          ) : line.selectedOptions.length > 0 ? (
                            <p className="text-xs text-ui-text-muted">
                              +{line.selectedOptions.map((opt) => opt.choiceName).join(', ')}
                            </p>
                          ) : (
                            <p className="text-xs text-ui-text-muted">{line.item.specLabel}</p>
                          )}
                          {line.itemNote ? (
                            <p className="mt-0.5 text-xs font-medium text-ui-accent">
                              Note: {line.itemNote}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm font-bold text-ui-text tabular-nums">
                          {formatPhp(line.lineTotalPhp)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="inline-flex shrink-0 items-center rounded-lg border border-ui-border bg-ui-surface">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${line.item.name}`}
                              onClick={() => {
                                setSubmitError(null);
                                setLineQuantity(line.lineId, line.quantity - 1);
                              }}
                              className="rounded-l-[calc(var(--radius-lg)-1px)] px-2.5 py-1 text-sm font-bold text-ui-text transition-colors motion-reduce:transition-none enabled:hover:bg-ui-surface-muted"
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
                              className="rounded-r-[calc(var(--radius-lg)-1px)] px-2.5 py-1 text-sm font-bold text-ui-text transition-colors motion-reduce:transition-none enabled:hover:bg-ui-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                          {line.quantity >= 50 ? (
                            <span className="text-[11px] text-ui-text-muted">Max 50</span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2.5">
                          {line.item.available ? (
                            <button
                              type="button"
                              aria-label={`Edit options for ${line.item.name}`}
                              onClick={() => setEditingCartLineId(line.lineId)}
                              onPointerEnter={preloadItemCustomizerModal}
                              onFocus={preloadItemCustomizerModal}
                              className={`text-xs font-semibold underline hover:opacity-80 ${
                                line.hasInvalidOptions ? 'text-ui-accent' : 'text-ui-text-muted'
                              }`}
                            >
                              Edit options
                            </button>
                          ) : null}
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
                  <div
                    className={`grid gap-2 ${
                      visibleFulfillmentModes.length === 1
                        ? 'grid-cols-1'
                        : visibleFulfillmentModes.length === 3
                          ? 'grid-cols-1 sm:grid-cols-3'
                          : 'grid-cols-2'
                    }`}
                  >
                    {visibleFulfillmentModes.includes('pickup') ? (
                      <label
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                          fulfillment === 'pickup'
                            ? 'border-ui-accent bg-ui-surface-muted font-semibold text-ui-text'
                            : 'border-ui-border bg-ui-surface text-ui-text-muted'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="fulfillment"
                            checked={fulfillment === 'pickup'}
                            onChange={() => {
                              setSelectedFulfillment('pickup');
                              if (dineInTable) clearDineInTable();
                              setTableNumberDraft(null);
                              setDeliveryPin(null);
                              setSelectedAddress(null);
                              setSubmitError(null);
                              setFieldErrors((prev) => ({
                                ...prev,
                                contactNumber: undefined,
                                tableNumber: undefined,
                                deliveryPin: undefined,
                                addressOrNotes: undefined,
                              }));
                            }}
                            className="accent-ui-accent"
                          />
                          Pickup
                        </span>
                        <span>Free</span>
                      </label>
                    ) : null}

                    {visibleFulfillmentModes.includes('delivery') ? (
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
                              setSelectedFulfillment('delivery');
                              if (dineInTable) clearDineInTable();
                              setTableNumberDraft(null);
                              setSubmitError(null);
                              setFieldErrors((prev) => ({ ...prev, tableNumber: undefined }));
                            }}
                            className="accent-ui-accent"
                          />
                          Delivery
                        </span>
                        <span className="tabular-nums">{deliveryOptionBadge}</span>
                      </label>
                    ) : null}

                    {visibleFulfillmentModes.includes('dine-in') ? (
                      <label
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                          fulfillment === 'dine-in'
                            ? 'border-ui-accent bg-ui-surface-muted font-semibold text-ui-text'
                            : 'border-ui-border bg-ui-surface text-ui-text-muted'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name="fulfillment"
                            checked={fulfillment === 'dine-in'}
                            onChange={() => {
                              setSelectedFulfillment('dine-in');
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
                          Dine-in
                        </span>
                        <span>Table</span>
                      </label>
                    ) : null}
                  </div>
                </fieldset>

                {fulfillment === 'dine-in' ? (
                  <div>
                    <label
                      htmlFor="checkout-table-number"
                      className="block text-xs font-semibold text-ui-text"
                    >
                      {store.dineInTableRequired ? 'Table Number' : 'Table Number (optional)'}
                    </label>
                    <input
                      ref={tableInputRef}
                      id="checkout-table-number"
                      name="tableNumber"
                      type="text"
                      maxLength={TABLE_NUMBER_MAX_LENGTH}
                      value={effectiveTableNumber}
                      aria-invalid={Boolean(fieldErrors.tableNumber)}
                      aria-describedby={fieldErrors.tableNumber ? tableErrorId : undefined}
                      onChange={(event) => {
                        setTableNumberDraft(event.target.value);
                        if (fieldErrors.tableNumber && event.target.value.trim()) {
                          setFieldErrors((prev) => ({ ...prev, tableNumber: undefined }));
                        }
                      }}
                      placeholder="e.g. 7 or Patio 2"
                      className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                        fieldErrors.tableNumber ? 'border-ui-error' : 'border-ui-border'
                      }`}
                    />
                    {fieldErrors.tableNumber ? (
                      <p
                        id={tableErrorId}
                        role="alert"
                        className="mt-1 text-xs font-semibold text-ui-error"
                      >
                        {fieldErrors.tableNumber}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {fulfillment === 'delivery' ? (
                  !isDeliveryEnabled ? (
                    <p
                      role="alert"
                      className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-medium text-ui-error"
                    >
                      Delivery is temporarily paused. Switch to {fallbackFulfillmentLabel} to place
                      your order.
                    </p>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-ui-border bg-ui-surface-muted p-3">
                      <DeliveryLocationPicker
                        inputRef={locationInputRef}
                        selectedAddress={selectedAddress}
                        pin={deliveryPin}
                        outOfRange={isOutOfRange}
                        distanceKm={deliveryQuote.distanceKm}
                        originLabel={originLabel}
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
                                ~{deliveryQuote.distanceKm.toFixed(1)} km from {originLabel} ·{' '}
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
                            (max coverage: {deliveryQuote.maxDeliveryDistanceKm} km from{' '}
                            {originLabel}). Search another address or switch to{' '}
                            {fallbackFulfillmentLabel}.
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
                      : fulfillment === 'dine-in'
                        ? 'Dine-in Notes (optional)'
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
                        : 'e.g. Extra napkins, utensils'
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
                    onChange={(event) =>
                      setSelectedPaymentMethod(event.target.value as PaymentMethod)
                    }
                    className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
                  >
                    {enabledPaymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {store.paymentMethods[method].label || PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </div>

                {paymentMethod !== 'cash' ? (
                  <div className="space-y-2.5 rounded-xl border border-ui-border bg-ui-surface-muted p-3">
                    <PaymentInstructionsCard
                      method={paymentMethod}
                      config={store.paymentMethods[paymentMethod]}
                      storeName={store.storeName}
                      contactPhone={store.contactPhone}
                    />
                    <div>
                      <label
                        htmlFor="checkout-payment-reference"
                        className="block text-xs font-semibold text-ui-text"
                      >
                        Payment Reference (optional)
                      </label>
                      <input
                        id="checkout-payment-reference"
                        name="paymentReference"
                        type="text"
                        maxLength={PAYMENT_REFERENCE_MAX_LENGTH}
                        value={checkoutPaymentRef}
                        onChange={(event) => setCheckoutPaymentRef(event.target.value)}
                        placeholder="e.g. Ref # 1234 5678 9012"
                        className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 font-mono text-xs text-ui-text"
                      />
                      <p className="mt-1 text-[11px] text-ui-text-muted">
                        Already paid? Enter your reference now, or submit it on the receipt screen
                        after placing your order.
                      </p>
                    </div>
                  </div>
                ) : store.paymentMethods.cash.instructions ? (
                  <p className="rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs text-ui-text-muted">
                    {store.paymentMethods.cash.instructions}
                  </p>
                ) : null}

                {submitError ? (
                  <div
                    role="alert"
                    className="space-y-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2.5 text-xs text-ui-error"
                  >
                    <p className="font-semibold">{submitError}</p>
                    {fulfillment === 'delivery' && (isPickupEnabled || isDineInEnabled) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFulfillment(fallbackFulfillment);
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
                        Switch to {fallbackFulfillmentLabel}
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
                    : `Place Order · ${formatPhp(grandTotalPhp)}`}
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>

      {editingCartLine ? (
        <Suspense fallback={null}>
          <ItemCustomizerModal
            item={editingCartLine.item}
            optionGroups={optionGroups}
            initialSelectedOptionIds={editingCartLine.selectedOptionIds}
            initialItemNote={editingCartLine.itemNote}
            initialQuantity={editingCartLine.quantity}
            submitLabel="Update item"
            onConfirm={(selection) => {
              updateCartLine(editingCartLine.lineId, selection);
              setSubmitError(null);
              setEditingCartLineId(null);
            }}
            onClose={() => setEditingCartLineId(null)}
          />
        </Suspense>
      ) : null}
    </div>,
    document.body,
  );
}

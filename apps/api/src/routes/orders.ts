import { createHash, createHmac } from 'node:crypto';
import {
  cancelPublicOrderByQueueRequestSchema,
  normalizeQueueNumber,
  placeOrderRequestSchema,
  submitPaymentReferenceRequestSchema,
  type PlaceOrderRequest,
} from '@menu-kiosk/contracts';
import { Hono } from 'hono';
import { refreshAdminSessionSingleFlight } from '../lib/auth-refresh';
import { clearAuthCookies, readAuthCookies, setAuthCookies } from '../lib/cookies';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { SlidingWindowRateLimiter, extractClientIp } from '../lib/rate-limit';
import type { ApiDeps, ApiEnv } from '../types';

const SAFE_IDEMPOTENCY_KEY = /^[a-zA-Z0-9._-]{16,128}$/;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deriveReceiptToken(secret: string, idempotencyKey: string): string {
  return createHmac('sha256', secret).update(`mk-receipt:${idempotencyKey}`).digest('hex');
}

function buildCanonicalPayloadHash(payload: PlaceOrderRequest): string {
  const normalized = {
    customerName: payload.customerName,
    contactNumber: payload.contactNumber,
    fulfillment: payload.fulfillment,
    tableNumber: payload.fulfillment === 'dine-in' ? payload.tableNumber.trim() : '',
    deliveryPin: payload.fulfillment === 'delivery' ? (payload.deliveryPin ?? null) : null,
    addressOrNotes: payload.addressOrNotes,
    paymentMethod: payload.paymentMethod,
    paymentReference: payload.paymentMethod !== 'cash' ? payload.paymentReference.trim() : '',
    items: payload.items.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      selectedOptionIds: [...new Set(line.selectedOptionIds)].sort(),
      itemNote: line.itemNote.trim(),
    })),
  };
  return sha256Hex(JSON.stringify(normalized));
}

export function createOrderRoutes(deps: ApiDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const limiter = deps.orderRateLimiter ?? new SlidingWindowRateLimiter(20, 60_000);
  const clientIp = (headers: Headers) => extractClientIp(headers, deps.config.trustProxy);

  async function resolveStoreProfile() {
    try {
      return deps.storeProfileCache
        ? await deps.storeProfileCache.get()
        : await deps.gateway.getStoreProfile();
    } catch {
      return null;
    }
  }

  app.post('/orders', async (c) => {
    const decision = limiter.check(`orders:${clientIp(c.req.raw.headers)}`);
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many order submissions. Please wait a moment and try again.',
      });
    }

    const idempotencyKey = c.req.header('idempotency-key')?.trim() ?? '';
    if (!SAFE_IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_IDEMPOTENCY_KEY',
        title: 'Bad Request',
        detail: 'A valid Idempotency-Key header (16–128 characters) is required.',
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_JSON',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }

    const parsed = placeOrderRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Please check your order details and try again.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const receiptToken = deriveReceiptToken(deps.config.receiptSigningSecret, idempotencyKey);
    const receiptTokenHash = sha256Hex(receiptToken);
    const payloadHash = buildCanonicalPayloadHash(parsed.data);

    const result = await deps.gateway.placeOrder({
      idempotencyKey,
      payloadHash,
      receiptTokenHash,
      request: parsed.data,
    });

    if (result.status === 'store_closed') {
      const closedNotice =
        result.closedNotice?.trim() || (await resolveStoreProfile())?.closedNotice.trim() || '';
      return problemResponse(c, {
        status: 422,
        code: 'STORE_CLOSED',
        title: 'Store Paused',
        detail: closedNotice
          ? `Ordering is currently paused: ${closedNotice}`
          : 'This shop is currently not accepting new orders. Please try again later.',
        extensions: {
          closedNotice,
        },
      });
    }

    if (result.status === 'item_unavailable') {
      return problemResponse(c, {
        status: 409,
        code: 'ITEM_UNAVAILABLE',
        title: 'Item Unavailable',
        detail: 'One or more items in your cart are sold out or no longer on the menu.',
        fieldErrors: {
          items: [`Item "${result.itemId}" is currently unavailable.`],
        },
      });
    }

    if (result.status === 'invalid_option_selection') {
      return problemResponse(c, {
        status: 422,
        code: 'INVALID_OPTION_SELECTION',
        title: 'Invalid Option Selection',
        detail: 'One or more selected options are no longer valid for an item in your bag.',
        fieldErrors: {
          items: [
            result.optionId
              ? `Option "${result.optionId}" is no longer available for this item.`
              : 'One or more selected options are no longer valid.',
          ],
        },
      });
    }

    if (result.status === 'option_unavailable') {
      return problemResponse(c, {
        status: 422,
        code: 'OPTION_UNAVAILABLE',
        title: 'Option Unavailable',
        detail:
          'One or more selected options are currently sold out. Please edit your item options.',
        fieldErrors: {
          items: [
            result.optionId
              ? `Option "${result.optionId}" is currently sold out.`
              : 'One or more selected options are currently sold out.',
          ],
        },
      });
    }

    if (result.status === 'required_option_missing') {
      return problemResponse(c, {
        status: 422,
        code: 'REQUIRED_OPTION_MISSING',
        title: 'Required Option Missing',
        detail: 'Please select all required options for your items before placing the order.',
        fieldErrors: {
          items: [
            result.groupId
              ? `Required selections are missing for option group "${result.groupId}".`
              : 'Required selections are missing for one or more items.',
          ],
        },
      });
    }

    if (result.status === 'option_limit_exceeded') {
      return problemResponse(c, {
        status: 422,
        code: 'OPTION_LIMIT_EXCEEDED',
        title: 'Option Limit Exceeded',
        detail:
          'Too many options were selected for an option group. Please update your selections.',
        fieldErrors: {
          items: [
            result.groupId
              ? `Too many options selected for option group "${result.groupId}".`
              : 'Too many options selected for one or more items.',
          ],
        },
      });
    }

    if (result.status === 'price_changed') {
      return problemResponse(c, {
        status: 409,
        code: 'PRICE_CHANGED',
        title: 'Order Total Updated',
        detail: `Menu or delivery pricing changed. Updated total is ₱${result.latestTotalPhp.toLocaleString('en-PH')}. Please review and confirm your order.`,
      });
    }

    if (result.status === 'idempotency_conflict') {
      return problemResponse(c, {
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
        title: 'Conflict',
        detail: 'This Idempotency-Key was already used with a different order payload.',
      });
    }

    if (result.status === 'customer_name_required') {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Customer name is required.',
        fieldErrors: {
          customerName: ['Enter your name before placing the order.'],
        },
      });
    }

    if (result.status === 'fulfillment_unavailable') {
      return problemResponse(c, {
        status: 422,
        code: 'FULFILLMENT_UNAVAILABLE',
        title: 'Fulfillment Unavailable',
        detail: 'The selected fulfillment method is currently unavailable. Choose another option.',
        fieldErrors: {
          fulfillment: ['Selected fulfillment mode is not enabled.'],
        },
      });
    }

    if (result.status === 'table_number_required') {
      return problemResponse(c, {
        status: 422,
        code: 'TABLE_NUMBER_REQUIRED',
        title: 'Table Number Required',
        detail: 'Enter your table number to place a dine-in order.',
        fieldErrors: {
          tableNumber: ['Table number is required for dine-in orders.'],
        },
      });
    }

    if (result.status === 'invalid_table_number') {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Table number must be 24 characters or fewer.',
        fieldErrors: {
          tableNumber: ['Table number must be 24 characters or fewer.'],
        },
      });
    }

    if (result.status === 'payment_method_unavailable') {
      return problemResponse(c, {
        status: 422,
        code: 'PAYMENT_METHOD_UNAVAILABLE',
        title: 'Payment Method Unavailable',
        detail: 'The selected payment method is not currently available. Choose another option.',
        fieldErrors: {
          paymentMethod: ['Selected payment method is not enabled.'],
        },
      });
    }

    if (result.status === 'invalid_payment_reference') {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Payment reference must be 80 characters or fewer.',
        fieldErrors: {
          paymentReference: ['Payment reference must be 80 characters or fewer.'],
        },
      });
    }

    if (result.status === 'delivery_unavailable') {
      return problemResponse(c, {
        status: 422,
        code: 'DELIVERY_UNAVAILABLE',
        title: 'Delivery Unavailable',
        detail: 'Delivery is currently paused. Switch to Pickup to continue.',
      });
    }

    if (result.status === 'delivery_pin_required') {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Please select a delivery address or use your device location.',
        fieldErrors: {
          deliveryPin: [
            'Select a delivery address from the suggestions or use your device location.',
          ],
        },
      });
    }

    if (result.status === 'out_of_delivery_range') {
      return problemResponse(c, {
        status: 422,
        code: 'OUT_OF_DELIVERY_RANGE',
        title: 'Outside Delivery Range',
        detail:
          'Your pinned drop-off is outside our active delivery radius. Try a closer pin or switch to Pickup.',
      });
    }

    c.header('Location', `/api/v1/orders/${result.order.id}`);
    return c.json(
      {
        data: result.order,
        receiptToken,
      },
      201,
    );
  });

  app.get('/orders/track/:queueNumber', async (c) => {
    const decision = limiter.check(`orders-track:${clientIp(c.req.raw.headers)}`);
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many order status lookups. Please wait a moment and try again.',
      });
    }

    const storeProfile = await resolveStoreProfile();
    const normalizedQueue = normalizeQueueNumber(
      c.req.param('queueNumber') ?? '',
      storeProfile?.queuePrefix ?? 'ORD',
    );
    if (!normalizedQueue || normalizedQueue.length > 20) {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'No order found for that queue number.',
      });
    }

    const tracker = await deps.gateway.getPublicOrderStatusByQueue(normalizedQueue);
    if (!tracker) {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'No order found for that queue number.',
      });
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: tracker }, 200);
  });

  app.post('/orders/track/:queueNumber/cancel', async (c) => {
    const decision = limiter.check(`orders-cancel:${clientIp(c.req.raw.headers)}`);
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many cancellation attempts. Please wait a moment and try again.',
      });
    }

    const storeProfile = await resolveStoreProfile();
    const normalizedQueue = normalizeQueueNumber(
      c.req.param('queueNumber') ?? '',
      storeProfile?.queuePrefix ?? 'ORD',
    );
    if (!normalizedQueue || normalizedQueue.length > 20) {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'No order found for that queue number.',
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_JSON',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }

    const parsed = cancelPublicOrderByQueueRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Provide the mobile number used on the order.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.cancelPublicOrderByQueue(normalizedQueue, parsed.data);
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'No order found for that queue number.',
      });
    }

    if (result.status === 'verification_failed') {
      return problemResponse(c, {
        status: 403,
        code: 'ORDER_VERIFICATION_FAILED',
        title: 'Verification Failed',
        detail: 'The verification details entered do not match this order.',
      });
    }

    if (result.status === 'not_cancellable') {
      return problemResponse(c, {
        status: 409,
        code: 'ORDER_NOT_CANCELLABLE',
        title: 'Order Cannot Be Cancelled',
        detail:
          'This order can no longer be cancelled online because preparation has started or payment has already been submitted.',
      });
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: result.tracker }, 200);
  });

  app.post('/orders/:id/cancel', async (c) => {
    const decision = limiter.check(`orders-cancel:${clientIp(c.req.raw.headers)}`);
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many cancellation attempts. Please wait a moment and try again.',
      });
    }

    const orderId = c.req.param('id');
    const receiptToken = c.req.header('x-order-receipt-token')?.trim();
    if (!receiptToken) {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'Order receipt could not be found.',
      });
    }

    const result = await deps.gateway.cancelOrderByReceipt(orderId, sha256Hex(receiptToken));
    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'Order receipt could not be found.',
      });
    }

    if (result.status === 'not_cancellable') {
      return problemResponse(c, {
        status: 409,
        code: 'ORDER_NOT_CANCELLABLE',
        title: 'Order Cannot Be Cancelled',
        detail:
          'This order can no longer be cancelled online because preparation has started or payment has already been submitted.',
      });
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: result.order }, 200);
  });

  app.post('/orders/:id/payment-reference', async (c) => {
    const decision = limiter.check(`orders-payment-ref:${clientIp(c.req.raw.headers)}`);
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds));
      return problemResponse(c, {
        status: 429,
        code: 'RATE_LIMITED',
        title: 'Too Many Requests',
        detail: 'Too many payment reference updates. Please wait a moment and try again.',
      });
    }

    const orderId = c.req.param('id');
    const receiptToken = c.req.header('x-order-receipt-token')?.trim();
    if (!receiptToken) {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'Order receipt could not be found.',
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(c, {
        status: 400,
        code: 'INVALID_JSON',
        title: 'Bad Request',
        detail: 'Request body must be valid JSON.',
      });
    }

    const parsed = submitPaymentReferenceRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Enter a valid payment reference number.',
        fieldErrors: zodFieldErrors(parsed.error),
      });
    }

    const result = await deps.gateway.submitPaymentReferenceByReceipt(
      orderId,
      sha256Hex(receiptToken),
      parsed.data.paymentReference,
    );

    if (result.status === 'not_found') {
      return problemResponse(c, {
        status: 404,
        code: 'ORDER_NOT_FOUND',
        title: 'Not Found',
        detail: 'Order receipt could not be found.',
      });
    }

    if (result.status === 'invalid_reference') {
      return problemResponse(c, {
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation Failed',
        detail: 'Enter a valid payment reference (1–80 characters).',
        fieldErrors: {
          paymentReference: ['Enter a valid payment reference (1–80 characters).'],
        },
      });
    }

    if (result.status === 'cash_not_applicable') {
      return problemResponse(c, {
        status: 422,
        code: 'PAYMENT_REFERENCE_NOT_APPLICABLE',
        title: 'Payment Reference Not Applicable',
        detail: 'Payment references apply only to digital wallet or bank transfer orders.',
      });
    }

    if (result.status === 'order_cancelled') {
      return problemResponse(c, {
        status: 409,
        code: 'ORDER_CANCELLED',
        title: 'Order Cancelled',
        detail: 'Payment references cannot be submitted for a cancelled order.',
      });
    }

    if (result.status === 'already_paid') {
      return problemResponse(c, {
        status: 409,
        code: 'ORDER_ALREADY_PAID',
        title: 'Payment Already Confirmed',
        detail: 'Payment for this order has already been marked as paid.',
      });
    }

    c.header('Cache-Control', 'no-store');
    return c.json({ data: result.order }, 200);
  });

  app.get('/orders/:id', async (c) => {
    const orderId = c.req.param('id');
    const receiptToken = c.req.header('x-order-receipt-token')?.trim();

    if (receiptToken) {
      const order = await deps.gateway.getOrderByReceipt(orderId, sha256Hex(receiptToken));
      if (order) {
        return c.json({ data: order }, 200);
      }
    }

    const { accessToken, refreshToken } = readAuthCookies(c);
    let verifiedAdminAccessToken: string | null = null;
    if (accessToken) {
      const admin = await deps.gateway.verifyAccessToken(accessToken);
      if (admin) {
        verifiedAdminAccessToken = accessToken;
      }
    }

    if (!verifiedAdminAccessToken && refreshToken) {
      const refreshed = await refreshAdminSessionSingleFlight(deps.gateway, refreshToken);
      if (refreshed) {
        setAuthCookies(c, deps.config, refreshed.tokens);
        verifiedAdminAccessToken = refreshed.tokens.accessToken;
      }
    }

    if (verifiedAdminAccessToken) {
      const order = await deps.gateway.getAdminOrderById(verifiedAdminAccessToken, orderId);
      if (order) {
        return c.json({ data: order }, 200);
      }
    } else if (accessToken || refreshToken) {
      clearAuthCookies(c, deps.config);
    }

    return problemResponse(c, {
      status: 404,
      code: 'ORDER_NOT_FOUND',
      title: 'Not Found',
      detail: 'Order receipt could not be found.',
    });
  });

  return app;
}

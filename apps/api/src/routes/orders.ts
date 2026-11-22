import { createHash, createHmac } from 'node:crypto';
import { placeOrderRequestSchema, type PlaceOrderRequest } from '@eight-burgers/contracts';
import { Hono } from 'hono';
import { readAuthCookies } from '../lib/cookies';
import { problemResponse, zodFieldErrors } from '../lib/problem';
import { SlidingWindowRateLimiter } from '../lib/rate-limit';
import type { ApiDeps, ApiEnv } from '../types';

const SAFE_IDEMPOTENCY_KEY = /^[a-zA-Z0-9._-]{16,128}$/;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deriveReceiptToken(secret: string, idempotencyKey: string): string {
  return createHmac('sha256', secret).update(`eb-receipt:${idempotencyKey}`).digest('hex');
}

function buildCanonicalPayloadHash(payload: PlaceOrderRequest): string {
  const normalized = {
    customerName: payload.customerName,
    contactNumber: payload.contactNumber,
    fulfillment: payload.fulfillment,
    deliveryZoneId: payload.fulfillment === 'delivery' ? (payload.deliveryZoneId ?? null) : null,
    deliveryPin: payload.fulfillment === 'delivery' ? (payload.deliveryPin ?? null) : null,
    addressOrNotes: payload.addressOrNotes,
    paymentMethod: payload.paymentMethod,
    items: payload.items.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      addonIds: [...new Set(line.addonIds)].sort(),
    })),
  };
  return sha256Hex(JSON.stringify(normalized));
}

function extractClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'local';
}

export function createOrderRoutes(deps: ApiDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const limiter = deps.orderRateLimiter ?? new SlidingWindowRateLimiter(20, 60_000);

  app.post('/orders', async (c) => {
    const decision = limiter.check(`orders:${extractClientIp(c.req.raw.headers)}`);
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

    const receiptToken = deriveReceiptToken(deps.config.supabaseServiceRoleKey, idempotencyKey);
    const receiptTokenHash = sha256Hex(receiptToken);
    const payloadHash = buildCanonicalPayloadHash(parsed.data);

    const result = await deps.gateway.placeOrder({
      idempotencyKey,
      payloadHash,
      receiptTokenHash,
      request: parsed.data,
    });

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

    if (result.status === 'delivery_unavailable') {
      return problemResponse(c, {
        status: 422,
        code: 'DELIVERY_UNAVAILABLE',
        title: 'Delivery Unavailable',
        detail: 'Delivery is currently paused. Switch to Chino Roces Pickup to continue.',
      });
    }

    if (result.status === 'out_of_delivery_range') {
      return problemResponse(c, {
        status: 422,
        code: 'OUT_OF_DELIVERY_RANGE',
        title: 'Outside Delivery Range',
        detail:
          'Your pinned drop-off is outside our active Metro Manila delivery radius. Try a closer pin or switch to Chino Roces Pickup.',
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

  app.get('/orders/:id', async (c) => {
    const orderId = c.req.param('id');
    const receiptToken = c.req.header('x-order-receipt-token')?.trim();

    if (receiptToken) {
      const order = await deps.gateway.getOrderByReceipt(orderId, sha256Hex(receiptToken));
      if (order) {
        return c.json({ data: order }, 200);
      }
    }

    const { accessToken } = readAuthCookies(c);
    if (accessToken) {
      const admin = await deps.gateway.verifyAccessToken(accessToken);
      if (admin) {
        const order = await deps.gateway.getAdminOrderById(accessToken, orderId);
        if (order) {
          return c.json({ data: order }, 200);
        }
      }
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

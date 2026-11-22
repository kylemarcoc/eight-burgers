import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_ITEMS,
  MENU_ADDONS,
  normalizeContactDigits,
  normalizeQueueNumber,
  type AdminUser,
  type DeliveryPricingConfig,
  type MenuItem,
  type OrderRecord,
  type PublicOrderTracker,
} from '@eight-burgers/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { ApiConfig } from './config/env';
import { SlidingWindowRateLimiter } from './lib/rate-limit';
import type { ShopBackendGateway } from './lib/supabase';

const TEST_CONFIG: ApiConfig = {
  nodeEnv: 'test',
  port: 8787,
  appOrigin: 'http://localhost:5173',
  cookieSecure: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'test-anon-key',
  supabaseServiceRoleKey: 'test-service-role-secret-key-for-hmac',
};

const ADMIN_USER: AdminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@eightburgers.local',
  role: 'owner',
};

function toPublicOrderTracker(order: OrderRecord): PublicOrderTracker {
  return {
    queueNumber: order.queueNumber,
    fulfillment: order.fulfillment,
    ...(order.deliveryZoneName ? { deliveryZoneName: order.deliveryZoneName } : {}),
    ...(order.deliveryEtaMinutes ? { deliveryEtaMinutes: order.deliveryEtaMinutes } : {}),
    lines: order.lines.map((line) => ({
      lineId: line.lineId,
      name: line.name,
      quantity: line.quantity,
      addonNames: line.addonNames,
    })),
    status: order.status,
    createdAtIso: order.createdAtIso,
    ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}),
  };
}

function createFakeGateway(overrides: Partial<ShopBackendGateway> = {}): {
  gateway: ShopBackendGateway;
  state: {
    menu: MenuItem[];
    deliveryPricing: DeliveryPricingConfig;
    orders: Map<
      string,
      { order: OrderRecord; idempotencyKey: string; payloadHash: string; receiptTokenHash: string }
    >;
    uploadedImages: Set<string>;
    seq: number;
  };
} {
  const state: {
    menu: MenuItem[];
    deliveryPricing: DeliveryPricingConfig;
    orders: Map<
      string,
      { order: OrderRecord; idempotencyKey: string; payloadHash: string; receiptTokenHash: string }
    >;
    uploadedImages: Set<string>;
    seq: number;
  } = {
    menu: DEFAULT_MENU_ITEMS.map((item) => ({
      ...item,
      updatedAt: '2026-11-22T01:00:00.000Z',
      version: 1,
    })),
    deliveryPricing: {
      zones: DEFAULT_DELIVERY_PRICING.zones.map((zone) => ({
        ...zone,
        updatedAt: '2026-11-22T01:00:00.000Z',
        version: 1,
      })),
      freeDeliveryMinSubtotalPhp: DEFAULT_DELIVERY_PRICING.freeDeliveryMinSubtotalPhp,
      updatedAt: '2026-11-22T01:00:00.000Z',
      version: 1,
    },
    orders: new Map<
      string,
      { order: OrderRecord; idempotencyKey: string; payloadHash: string; receiptTokenHash: string }
    >(),
    uploadedImages: new Set<string>(),
    seq: 101,
  };

  const gateway: ShopBackendGateway = {
    checkDatabaseReady: async () => true,
    getCatalog: async () => ({
      menu: state.menu,
      addons: [...MENU_ADDONS],
      deliveryPricing: state.deliveryPricing,
    }),
    listMenuItems: async (filters) =>
      state.menu.filter((item) => {
        if (filters.category && item.category !== filters.category) return false;
        if (typeof filters.available === 'boolean' && item.available !== filters.available) {
          return false;
        }
        if (filters.q && !item.name.toLowerCase().includes(filters.q.toLowerCase())) return false;
        return true;
      }),
    getDeliveryPricing: async () => state.deliveryPricing,
    placeOrder: async ({ idempotencyKey, payloadHash, receiptTokenHash, request }) => {
      for (const existing of state.orders.values()) {
        if (existing.idempotencyKey === idempotencyKey) {
          if (existing.payloadHash !== payloadHash) {
            return { status: 'idempotency_conflict' };
          }
          return { status: 'ok', replayed: true, order: existing.order };
        }
      }

      let subtotal = 0;
      const lines = [];
      for (const reqLine of request.items) {
        const item = state.menu.find((entry) => entry.id === reqLine.itemId);
        if (!item || !item.available) {
          return { status: 'item_unavailable', itemId: reqLine.itemId };
        }
        const lineTotal = item.pricePhp * reqLine.quantity;
        subtotal += lineTotal;
        lines.push({
          lineId: item.id,
          itemId: item.id,
          name: item.name,
          unitPricePhp: item.pricePhp,
          addonNames: [],
          addonsPricePhp: 0,
          quantity: reqLine.quantity,
          lineTotalPhp: lineTotal,
        });
      }

      if (
        request.fulfillment === 'delivery' &&
        request.deliveryPin &&
        request.deliveryPin.lat < 14.2
      ) {
        return { status: 'out_of_delivery_range' };
      }

      const deliveryFeePhp = request.fulfillment === 'delivery' && subtotal < 500 ? 35 : 0;
      const totalPhp = subtotal + deliveryFeePhp;
      if (request.expectedTotalPhp !== undefined && request.expectedTotalPhp !== totalPhp) {
        return { status: 'price_changed', latestTotalPhp: totalPhp };
      }

      const seq = state.seq;
      state.seq += 1;
      const order: OrderRecord = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        queueNumber: `#8B-${seq}`,
        customerName: request.customerName,
        contactNumber: request.contactNumber,
        fulfillment: request.fulfillment,
        ...(request.fulfillment === 'delivery'
          ? {
              deliveryZoneId: 'chino-roces-san-antonio',
              deliveryZoneName: 'Chino Roces & San Antonio',
              deliveryEtaMinutes: '15–25 min',
            }
          : {}),
        addressOrNotes: request.addressOrNotes,
        paymentMethod: request.paymentMethod,
        lines,
        subtotalPhp: subtotal,
        deliveryFeePhp,
        totalPhp,
        status: 'received',
        createdAtIso: '2026-11-22T02:00:00.000Z',
        updatedAt: '2026-11-22T02:00:00.000Z',
        version: 1,
      };
      state.orders.set(order.id, { order, idempotencyKey, payloadHash, receiptTokenHash });
      return { status: 'ok', replayed: false, order };
    },
    getOrderByReceipt: async (orderId, receiptTokenHash) => {
      const entry = state.orders.get(orderId);
      if (!entry || entry.receiptTokenHash !== receiptTokenHash) return null;
      return entry.order;
    },
    cancelOrderByReceipt: async (orderId, receiptTokenHash) => {
      const entry = state.orders.get(orderId);
      if (!entry || entry.receiptTokenHash !== receiptTokenHash) {
        return { status: 'not_found' };
      }
      if (entry.order.status === 'cancelled') {
        return { status: 'ok', order: entry.order };
      }
      if (entry.order.status !== 'received') {
        return { status: 'not_cancellable', order: entry.order };
      }
      entry.order = {
        ...entry.order,
        status: 'cancelled',
        updatedAt: '2026-11-22T05:00:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', order: entry.order };
    },
    getPublicOrderStatusByQueue: async (queueNumber) => {
      const normalized = normalizeQueueNumber(queueNumber);
      const entry = [...state.orders.values()]
        .reverse()
        .find((item) => item.order.queueNumber.toUpperCase() === normalized.toUpperCase());
      return entry ? toPublicOrderTracker(entry.order) : null;
    },
    cancelPublicOrderByQueue: async (queueNumber, verification) => {
      const normalized = normalizeQueueNumber(queueNumber);
      const entry = [...state.orders.values()]
        .reverse()
        .find((item) => item.order.queueNumber.toUpperCase() === normalized.toUpperCase());
      if (!entry) return { status: 'not_found' };

      const orderDigits = normalizeContactDigits(entry.order.contactNumber);
      const inputDigits = normalizeContactDigits(verification.contactNumber ?? '');
      const orderName = entry.order.customerName.trim().replace(/\s+/g, ' ').toLowerCase();
      const inputName = (verification.customerName ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

      const verified =
        entry.order.fulfillment === 'delivery'
          ? Boolean(orderDigits && inputDigits && orderDigits === inputDigits)
          : Boolean(
              (orderName && inputName && orderName === inputName) ||
              (orderDigits && inputDigits && orderDigits === inputDigits),
            );

      if (!verified) {
        return { status: 'verification_failed' };
      }

      if (entry.order.status === 'cancelled') {
        return { status: 'ok', tracker: toPublicOrderTracker(entry.order) };
      }
      if (entry.order.status !== 'received') {
        return { status: 'not_cancellable', tracker: toPublicOrderTracker(entry.order) };
      }

      entry.order = {
        ...entry.order,
        status: 'cancelled',
        updatedAt: '2026-11-22T05:00:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', tracker: toPublicOrderTracker(entry.order) };
    },
    signInAdmin: async (email, password) => {
      if (email === 'nonadmin@eightburgers.local' && password === 'valid-pass') {
        return { status: 'forbidden' };
      }
      if (email === ADMIN_USER.email && password === 'EightBurgersDev123!') {
        return {
          status: 'ok',
          user: ADMIN_USER,
          tokens: {
            accessToken: 'valid-access-token',
            refreshToken: 'valid-refresh-token',
            expiresInSeconds: 3600,
          },
        };
      }
      return { status: 'invalid_credentials' };
    },
    verifyAccessToken: async (token) => (token === 'valid-access-token' ? ADMIN_USER : null),
    refreshAdminSession: async (refreshToken) =>
      refreshToken === 'valid-refresh-token'
        ? {
            user: ADMIN_USER,
            tokens: {
              accessToken: 'valid-access-token',
              refreshToken: 'rotated-refresh-token',
              expiresInSeconds: 3600,
            },
          }
        : null,
    signOutAdmin: async () => undefined,
    createMenuItem: async (_token, input) => {
      const created: MenuItem = {
        id: 'custom-smash-burger',
        ...input,
        updatedAt: '2026-11-22T03:00:00.000Z',
        version: 1,
      };
      state.menu.unshift(created);
      return created;
    },
    updateMenuItem: async (_token, id, input, expectedVersion) => {
      const idx = state.menu.findIndex((item) => item.id === id);
      if (idx === -1) return { status: 'not_found' };
      const existing = state.menu[idx];
      if (!existing) return { status: 'not_found' };
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        return { status: 'conflict', latest: existing };
      }
      const updated: MenuItem = {
        ...existing,
        ...input,
        updatedAt: '2026-11-22T04:00:00.000Z',
        version: (existing.version ?? 1) + 1,
      };
      state.menu[idx] = updated;
      return { status: 'ok', data: updated };
    },
    setMenuItemAvailability: async (_token, id, available, expectedVersion) => {
      const idx = state.menu.findIndex((item) => item.id === id);
      if (idx === -1) return { status: 'not_found' };
      const existing = state.menu[idx];
      if (!existing) return { status: 'not_found' };
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        return { status: 'conflict', latest: existing };
      }
      const updated: MenuItem = {
        ...existing,
        available,
        updatedAt: '2026-11-22T04:00:00.000Z',
        version: (existing.version ?? 1) + 1,
      };
      state.menu[idx] = updated;
      return { status: 'ok', data: updated };
    },
    deleteMenuItem: async (_token, id) => {
      const target = state.menu.find((item) => item.id === id);
      const prevLen = state.menu.length;
      state.menu = state.menu.filter((item) => item.id !== id);
      if (target && !state.menu.some((item) => item.imageUrl === target.imageUrl)) {
        state.uploadedImages.delete(target.imageUrl);
      }
      return state.menu.length < prevLen ? 'deleted' : 'not_found';
    },
    resetMenuCatalog: async () => {
      state.uploadedImages.clear();
      return state.menu;
    },
    uploadMenuImage: async () => {
      const seq = state.seq;
      state.seq += 1;
      const path = `items/00000000-0000-4000-8000-${String(seq).padStart(12, '0')}.webp`;
      const imageUrl = `/storage/v1/object/public/menu-images/${path}`;
      state.uploadedImages.add(imageUrl);
      return { path, imageUrl };
    },
    deleteUnusedMenuImage: async (_token, imageUrl) => {
      if (state.menu.some((item) => item.imageUrl === imageUrl)) {
        return 'ignored';
      }
      return state.uploadedImages.delete(imageUrl) ? 'deleted' : 'ignored';
    },
    updateFreeDeliveryThreshold: async (_token, minSubtotalPhp, expectedVersion) => {
      if (expectedVersion !== undefined && state.deliveryPricing.version !== expectedVersion) {
        return { status: 'conflict', latest: state.deliveryPricing };
      }
      state.deliveryPricing = {
        ...state.deliveryPricing,
        freeDeliveryMinSubtotalPhp: minSubtotalPhp,
        version: (state.deliveryPricing.version ?? 1) + 1,
      };
      return { status: 'ok', data: state.deliveryPricing };
    },
    createDeliveryZone: async (_token, input) => ({
      id: 'new-zone',
      ...input,
      updatedAt: '2026-11-22T03:00:00.000Z',
      version: 1,
    }),
    updateDeliveryZone: async (_token, id, input, expectedVersion) => {
      const existing = state.deliveryPricing.zones.find((entry) => entry.id === id);
      if (existing && expectedVersion !== undefined && existing.version !== expectedVersion) {
        return { status: 'conflict', latest: existing };
      }
      return {
        status: 'ok',
        data: {
          id,
          ...input,
          updatedAt: '2026-11-22T03:00:00.000Z',
          version: (existing?.version ?? 1) + 1,
        },
      };
    },
    setDeliveryZoneEnabled: async (_token, id, enabled, expectedVersion) => {
      const zone = state.deliveryPricing.zones.find((entry) => entry.id === id);
      if (!zone) return { status: 'not_found' };
      if (expectedVersion !== undefined && zone.version !== expectedVersion) {
        return { status: 'conflict', latest: zone };
      }
      zone.enabled = enabled;
      zone.version = (zone.version ?? 1) + 1;
      return { status: 'ok', data: zone };
    },
    deleteDeliveryZone: async () => 'deleted',
    resetDeliveryPricing: async () => state.deliveryPricing,
    listAdminOrders: async (_token, params) => {
      const allOrders = [...state.orders.values()].map((entry) => entry.order);
      const queryLower = params.q?.trim().toLowerCase() ?? '';
      const baseFiltered = allOrders.filter((order) => {
        if (queryLower) {
          const hit =
            order.queueNumber.toLowerCase().includes(queryLower) ||
            order.customerName.toLowerCase().includes(queryLower) ||
            order.contactNumber.toLowerCase().includes(queryLower) ||
            (order.deliveryZoneName?.toLowerCase().includes(queryLower) ?? false);
          if (!hit) return false;
        }
        return true;
      });

      const counts = {
        all: baseFiltered.length,
        active: baseFiltered.filter(
          (order) => order.status !== 'completed' && order.status !== 'cancelled',
        ).length,
        received: baseFiltered.filter((order) => order.status === 'received').length,
        grilling: baseFiltered.filter((order) => order.status === 'grilling').length,
        ready: baseFiltered.filter((order) => order.status === 'ready').length,
        completed: baseFiltered.filter((order) => order.status === 'completed').length,
        cancelled: baseFiltered.filter((order) => order.status === 'cancelled').length,
      };

      const statusFiltered = baseFiltered.filter((order) => {
        if (!params.status || params.status === 'all') return true;
        if (params.status === 'active') {
          return order.status !== 'completed' && order.status !== 'cancelled';
        }
        return order.status === params.status;
      });

      const asc = params.sort === 'asc';
      const sorted = [...statusFiltered].sort((a, b) => {
        const cmpTime = a.createdAtIso.localeCompare(b.createdAtIso);
        const cmp = cmpTime !== 0 ? cmpTime : a.id.localeCompare(b.id);
        return asc ? cmp : -cmp;
      });

      const cursor = params.cursor;
      const afterCursor = cursor
        ? sorted.filter((order) => {
            const cmpTime = order.createdAtIso.localeCompare(cursor.createdAt);
            const cmp = cmpTime !== 0 ? cmpTime : order.id.localeCompare(cursor.id);
            return asc ? cmp > 0 : cmp < 0;
          })
        : sorted;

      const hasMore = afterCursor.length > params.limit;
      const sliced = hasMore ? afterCursor.slice(0, params.limit) : afterCursor;
      const last = sliced[sliced.length - 1];
      return {
        orders: sliced,
        nextCursor: hasMore && last ? `${last.createdAtIso}|${last.id}` : null,
        ...(!params.cursor ? { counts } : {}),
      };
    },
    getAdminOrderById: async (_token, orderId) => state.orders.get(orderId)?.order ?? null,
    updateOrderStatus: async (_token, orderId, status, expectedVersion) => {
      const entry = state.orders.get(orderId);
      if (!entry) return { status: 'not_found' };
      if (expectedVersion !== undefined && entry.order.version !== expectedVersion) {
        return { status: 'conflict', latest: entry.order };
      }
      entry.order = {
        ...entry.order,
        status,
        updatedAt: '2026-11-22T05:00:00.000Z',
        version: (entry.order.version ?? 1) + 1,
      };
      return { status: 'ok', data: entry.order };
    },
    ...overrides,
  };

  return { gateway, state };
}

const CSRF_HEADERS = {
  Origin: 'http://localhost:5173',
  'X-Requested-With': 'fetch',
  'Content-Type': 'application/json',
};

describe('Eight Burgers REST BFF', () => {
  it('serves healthz, readyz, and catalog endpoints', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    const healthRes = await app.request('/healthz');
    expect(healthRes.status).toBe(200);

    const readyRes = await app.request('/readyz');
    expect(readyRes.status).toBe(200);

    const catalogRes = await app.request('/api/v1/catalog');
    expect(catalogRes.status).toBe(200);
    const catalogJson = (await catalogRes.json()) as { data: { menu: MenuItem[] } };
    expect(catalogJson.data.menu).toHaveLength(16);
    expect(catalogRes.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns 503 on /readyz when database is unreachable', async () => {
    const { gateway } = createFakeGateway({ checkDatabaseReady: async () => false });
    const app = createApp({ config: TEST_CONFIG, gateway });

    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });

  it('enforces CSRF, idempotency, receipt token privacy, and server-side checkout rules', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    const orderPayload = {
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'gcash',
      items: [{ itemId: 'burger-deluxe', quantity: 2, addonIds: [] }],
    };

    // Reject missing CSRF header
    const noCsrfRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify(orderPayload),
    });
    expect(noCsrfRes.status).toBe(403);

    // Reject missing Idempotency-Key
    const noKeyRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify(orderPayload),
    });
    expect(noKeyRes.status).toBe(400);

    // Create order successfully
    const idempotencyKey = '11111111-2222-4333-8444-555555555555';
    const createRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(orderPayload),
    });
    expect(createRes.status).toBe(201);
    expect(createRes.headers.get('cache-control')).toBe('no-store');
    const createdBody = (await createRes.json()) as { data: OrderRecord; receiptToken: string };
    expect(createdBody.data.queueNumber).toBe('#8B-101');
    expect(createdBody.data.totalPhp).toBe(296);

    // Idempotent replay returns exact same order + receipt token without incrementing queue
    const replayRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(orderPayload),
    });
    expect(replayRes.status).toBe(201);
    const replayBody = (await replayRes.json()) as { data: OrderRecord; receiptToken: string };
    expect(replayBody.data.queueNumber).toBe('#8B-101');
    expect(replayBody.receiptToken).toBe(createdBody.receiptToken);

    // Same key with mutated payload -> 409 IDEMPOTENCY_CONFLICT
    const conflictRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...orderPayload, customerName: 'Different Name' }),
    });
    expect(conflictRes.status).toBe(409);

    // Receipt endpoint rejects missing token (404) and allows valid receipt token (200)
    const unauthReceiptRes = await app.request(`/api/v1/orders/${createdBody.data.id}`);
    expect(unauthReceiptRes.status).toBe(404);

    const validReceiptRes = await app.request(`/api/v1/orders/${createdBody.data.id}`, {
      headers: { 'X-Order-Receipt-Token': createdBody.receiptToken },
    });
    expect(validReceiptRes.status).toBe(200);
    expect(validReceiptRes.headers.get('cache-control')).toBe('no-store');

    // Out-of-range delivery pin returns 422
    const outOfRangeRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': '22222222-2222-4333-8444-555555555555' },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.1, lng: 121.5 },
        addressOrNotes: 'Far South',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
      }),
    });
    expect(outOfRangeRes.status).toBe(422);

    // Stale expectedTotalPhp returns 409 PRICE_CHANGED
    const priceChangedRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Idempotency-Key': '33333333-2222-4333-8444-555555555555' },
      body: JSON.stringify({ ...orderPayload, expectedTotalPhp: 100 }),
    });
    expect(priceChangedRes.status).toBe(409);
  });

  it('enforces HttpOnly admin cookies, silent refresh, optimistic concurrency, and logout', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    // Unauthenticated admin request returns 401
    const unauthRes = await app.request('/api/v1/admin/orders');
    expect(unauthRes.status).toBe(401);

    // Non-admin returns 403
    const forbiddenLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: 'nonadmin@eightburgers.local', password: 'valid-pass' }),
    });
    expect(forbiddenLogin.status).toBe(403);

    // Valid owner login sets HttpOnly SameSite=Lax cookies
    const loginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: ADMIN_USER.email, password: 'EightBurgersDev123!' }),
    });
    expect(loginRes.status).toBe(200);
    const setCookies = loginRes.headers.getSetCookie();
    expect(
      setCookies.some(
        (cookie) =>
          cookie.includes('eb_access_token=valid-access-token') &&
          cookie.includes('HttpOnly') &&
          cookie.includes('SameSite=Lax'),
      ),
    ).toBe(true);

    // Expired access cookie + valid refresh cookie silently refreshes on admin route
    const refreshedAdminRes = await app.request('/api/v1/admin/orders', {
      headers: {
        Cookie: 'eb_access_token=expired-token; eb_refresh_token=valid-refresh-token',
      },
    });
    expect(refreshedAdminRes.status).toBe(200);
    expect(
      refreshedAdminRes.headers
        .getSetCookie()
        .some((cookie) => cookie.includes('eb_refresh_token=rotated-refresh-token')),
    ).toBe(true);

    // Optimistic concurrency conflict (409) when expectedVersion is stale
    const conflictPatch = await app.request('/api/v1/admin/menu-items/burger-deluxe/availability', {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({
        available: false,
        expectedVersion: 99,
      }),
    });
    expect(conflictPatch.status).toBe(409);

    // Delete menu item returns 204 No Content
    const deleteRes = await app.request('/api/v1/admin/menu-items/burger-deluxe', {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'eb_access_token=valid-access-token',
      },
    });
    expect(deleteRes.status).toBe(204);

    // Logout clears cookies and returns 204
    const logoutRes = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'eb_access_token=valid-access-token',
      },
    });
    expect(logoutRes.status).toBe(204);
  });

  it('enforces rate limiting with Retry-After and redacts unexpected errors', async () => {
    const { gateway } = createFakeGateway({
      getCatalog: async () => {
        throw new Error('pg internal relation secret_table failed');
      },
    });
    const loginRateLimiter = new SlidingWindowRateLimiter(1, 60_000);
    const app = createApp({ config: TEST_CONFIG, gateway, loginRateLimiter });

    const firstLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: 'owner@eightburgers.local', password: 'wrong' }),
    });
    expect(firstLogin.status).toBe(401);

    const secondLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email: 'owner@eightburgers.local', password: 'wrong' }),
    });
    expect(secondLogin.status).toBe(429);
    expect(Number(secondLogin.headers.get('retry-after'))).toBeGreaterThan(0);

    const errorRes = await app.request('/api/v1/catalog');
    expect(errorRes.status).toBe(500);
    const bodyText = await errorRes.text();
    expect(bodyText).not.toContain('secret_table');
  });

  it('updates admin order status with integer expectedVersion optimistic locking', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    const createRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': '44444444-2222-4333-8444-555555555555',
      },
      body: JSON.stringify({
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'kiosk-pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
      }),
    });
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as { data: OrderRecord };
    expect(createdBody.data.version).toBe(1);

    const patchRes = await app.request(`/api/v1/admin/orders/${createdBody.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({
        status: 'grilling',
        expectedVersion: createdBody.data.version,
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as { data: OrderRecord };
    expect(patchBody.data.status).toBe('grilling');
    expect(patchBody.data.version).toBe(2);

    // Reusing stale version 1 triggers 409 Conflict
    const staleRes = await app.request(`/api/v1/admin/orders/${createdBody.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({
        status: 'ready',
        expectedVersion: 1,
      }),
    });
    expect(staleRes.status).toBe(409);

    // Invalid version returns 400 Validation Failed
    const invalidRes = await app.request(`/api/v1/admin/orders/${createdBody.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({
        status: 'ready',
        expectedVersion: 0,
      }),
    });
    expect(invalidRes.status).toBe(400);
  });

  it('supports composite cursor tie-breaking, server-side filters, counts, and strict query validation on admin orders', async () => {
    const { gateway, state } = createFakeGateway();
    const sharedTs = '2026-11-22T02:00:00.000Z';
    const seedOrder = (
      id: string,
      queueNumber: string,
      customerName: string,
      status: OrderRecord['status'],
      createdAtIso: string,
    ): OrderRecord => ({
      id,
      queueNumber,
      customerName,
      contactNumber: '09171234567',
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
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
      deliveryFeePhp: 0,
      totalPhp: 148,
      status,
      createdAtIso,
      updatedAt: createdAtIso,
      version: 1,
    });

    const orders: OrderRecord[] = [
      seedOrder('00000000-0000-4000-8000-000000000003', '#8B-103', 'Carla', 'received', sharedTs),
      seedOrder('00000000-0000-4000-8000-000000000002', '#8B-102', 'Marco', 'grilling', sharedTs),
      seedOrder(
        '00000000-0000-4000-8000-000000000001',
        '#8B-101',
        'Alex',
        'completed',
        '2026-11-22T01:00:00.000Z',
      ),
    ];
    for (const order of orders) {
      state.orders.set(order.id, {
        order,
        idempotencyKey: order.id,
        payloadHash: order.id,
        receiptTokenHash: order.id,
      });
    }

    const app = createApp({ config: TEST_CONFIG, gateway });
    const authHeaders = { Cookie: 'eb_access_token=valid-access-token' };

    // Page 1 (limit=1, status=active) returns #8B-103 with composite cursor and full stage counts
    const page1Res = await app.request('/api/v1/admin/orders?status=active&limit=1', {
      headers: authHeaders,
    });
    expect(page1Res.status).toBe(200);
    const page1 = (await page1Res.json()) as {
      data: OrderRecord[];
      nextCursor: string | null;
      counts?: Record<string, number>;
    };
    expect(page1.data.map((o) => o.queueNumber)).toEqual(['#8B-103']);
    expect(page1.nextCursor).toBe(`${sharedTs}|00000000-0000-4000-8000-000000000003`);
    expect(page1.counts).toEqual({
      all: 3,
      active: 2,
      received: 1,
      grilling: 1,
      ready: 0,
      completed: 1,
      cancelled: 0,
    });

    // Page 2 with composite cursor does NOT drop #8B-102 even though createdAtIso is identical
    const page2Res = await app.request(
      `/api/v1/admin/orders?status=active&limit=1&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`,
      { headers: authHeaders },
    );
    expect(page2Res.status).toBe(200);
    const page2 = (await page2Res.json()) as { data: OrderRecord[]; nextCursor: string | null };
    expect(page2.data.map((o) => o.queueNumber)).toEqual(['#8B-102']);
    expect(page2.nextCursor).toBeNull();

    // FIFO sort (asc) returns older #8B-102 before #8B-103
    const fifoRes = await app.request('/api/v1/admin/orders?status=active&sort=asc&limit=10', {
      headers: authHeaders,
    });
    expect(fifoRes.status).toBe(200);
    const fifoBody = (await fifoRes.json()) as { data: OrderRecord[] };
    expect(fifoBody.data.map((o) => o.queueNumber)).toEqual(['#8B-102', '#8B-103']);

    // Invalid cursor and invalid limit return 400 INVALID_QUERY
    const badCursorRes = await app.request('/api/v1/admin/orders?cursor=not-a-valid-cursor', {
      headers: authHeaders,
    });
    expect(badCursorRes.status).toBe(400);

    const badLimitRes = await app.request('/api/v1/admin/orders?limit=999', {
      headers: authHeaders,
    });
    expect(badLimitRes.status).toBe(400);
  });

  it('deduplicates concurrent refresh-token rotations and rejects sub-0.1km delivery zones', async () => {
    let refreshCalls = 0;
    const { gateway } = createFakeGateway({
      refreshAdminSession: async (refreshToken) => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        if (refreshToken !== 'valid-refresh-token') return null;
        return {
          user: ADMIN_USER,
          tokens: {
            accessToken: 'valid-access-token',
            refreshToken: 'rotated-refresh-token',
            expiresInSeconds: 3600,
          },
        };
      },
    });
    const app = createApp({ config: TEST_CONFIG, gateway });
    const expiredCookies = {
      Cookie: 'eb_access_token=expired-token; eb_refresh_token=valid-refresh-token',
    };

    const [resA, resB] = await Promise.all([
      app.request('/api/v1/auth/session', { headers: expiredCookies }),
      app.request('/api/v1/admin/orders', { headers: expiredCookies }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(refreshCalls).toBe(1);

    // Sub-0.1km delivery radius is rejected with 400 VALIDATION_ERROR
    const tinyZoneRes = await app.request('/api/v1/admin/delivery-zones', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({
        name: 'Micro Zone',
        areas: 'Lobby',
        maxDistanceKm: 0.04,
        feePhp: 20,
        etaMinutes: '10 min',
        enabled: true,
      }),
    });
    expect(tinyZoneRes.status).toBe(400);

    // Disabling free-delivery threshold persists null (not coerced to 500)
    const disableFreeDeliveryRes = await app.request('/api/v1/admin/delivery-pricing', {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({
        freeDeliveryMinSubtotalPhp: null,
        expectedVersion: 1,
      }),
    });
    expect(disableFreeDeliveryRes.status).toBe(200);
    const disableBody = (await disableFreeDeliveryRes.json()) as {
      data: DeliveryPricingConfig;
    };
    expect(disableBody.data.freeDeliveryMinSubtotalPhp).toBeNull();
  });

  it('uploads, optimizes to WebP, and cleans up unused menu images via admin endpoints', async () => {
    const { gateway, state } = createFakeGateway();
    const app = createApp({
      config: TEST_CONFIG,
      gateway,
      optimizeMenuImage: async (buf) => ({
        buffer: buf,
        width: 1200,
        height: 800,
        sizeBytes: 32_100,
        contentType: 'image/webp',
      }),
    });

    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3, 4])], 'burger.png', { type: 'image/png' }),
    );

    // Unauthenticated upload rejected with 401
    const unauthUpload = await app.request('/api/v1/admin/menu-images', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
      },
      body: formData,
    });
    expect(unauthUpload.status).toBe(401);

    // Authenticated upload succeeds and returns optimized WebP metadata
    const uploadRes = await app.request('/api/v1/admin/menu-images', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'fetch',
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: formData,
    });
    expect(uploadRes.status).toBe(201);
    const uploadBody = (await uploadRes.json()) as {
      data: { imageUrl: string; path: string; contentType: string; width: number; height: number };
    };
    expect(uploadBody.data.contentType).toBe('image/webp');
    expect(uploadBody.data.imageUrl).toContain('/storage/v1/object/public/menu-images/items/');
    expect(state.uploadedImages.has(uploadBody.data.imageUrl)).toBe(true);

    // Deleting an unused uploaded image removes it cleanly
    const deleteRes = await app.request('/api/v1/admin/menu-images', {
      method: 'DELETE',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({ imageUrl: uploadBody.data.imageUrl }),
    });
    expect(deleteRes.status).toBe(204);
    expect(state.uploadedImages.has(uploadBody.data.imageUrl)).toBe(false);
  });

  it('supports public non-PII queue tracking and two-tier order cancellation while status is received', async () => {
    const { gateway } = createFakeGateway();
    const app = createApp({ config: TEST_CONFIG, gateway });

    // Place a delivery order (#8B-101) and a kiosk pickup order (#8B-102)
    const deliveryOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'cancel-test-delivery-order-101',
      },
      body: JSON.stringify({
        customerName: 'Marco Santos',
        contactNumber: '09171234567',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5608, lng: 121.0124 },
        addressOrNotes: 'Unit 402 Chino Roces',
        paymentMethod: 'gcash',
        items: [{ itemId: 'burger-deluxe', quantity: 2, addonIds: [] }],
      }),
    });
    expect(deliveryOrderRes.status).toBe(201);
    const deliveryCreated = (await deliveryOrderRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };

    const pickupOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'cancel-test-pickup-order-102',
      },
      body: JSON.stringify({
        customerName: 'Ana Reyes',
        contactNumber: '',
        fulfillment: 'kiosk-pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        items: [{ itemId: 'chicano-burger', quantity: 1, addonIds: [] }],
      }),
    });
    expect(pickupOrderRes.status).toBe(201);
    const pickupCreated = (await pickupOrderRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };

    // Public tracker lookup works by numeric or prefixed queue number and omits PII
    const trackRes = await app.request('/api/v1/orders/track/101');
    expect(trackRes.status).toBe(200);
    const trackBody = (await trackRes.json()) as { data: Record<string, unknown> };
    expect(trackBody.data.queueNumber).toBe('#8B-101');
    expect(trackBody.data.status).toBe('received');
    expect(trackBody.data.customerName).toBeUndefined();
    expect(trackBody.data.contactNumber).toBeUndefined();
    expect(trackBody.data.addressOrNotes).toBeUndefined();

    // Tier 1: Cancel order #8B-101 with valid X-Order-Receipt-Token
    const badTokenCancel = await app.request(`/api/v1/orders/${deliveryCreated.data.id}/cancel`, {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'X-Order-Receipt-Token': 'wrong-token',
      },
    });
    expect(badTokenCancel.status).toBe(404);

    const tier1Cancel = await app.request(`/api/v1/orders/${deliveryCreated.data.id}/cancel`, {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'X-Order-Receipt-Token': deliveryCreated.receiptToken,
      },
    });
    expect(tier1Cancel.status).toBe(200);
    const tier1Body = (await tier1Cancel.json()) as { data: OrderRecord };
    expect(tier1Body.data.status).toBe('cancelled');

    // Tier 2: Cross-device queue cancel rejects wrong customer name with 403 and succeeds with matching name
    const wrongNameCancel = await app.request('/api/v1/orders/track/8B-102/cancel', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ customerName: 'Wrong Person' }),
    });
    expect(wrongNameCancel.status).toBe(403);

    const tier2Cancel = await app.request('/api/v1/orders/track/102/cancel', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ customerName: '  ana   reyes ' }),
    });
    expect(tier2Cancel.status).toBe(200);
    const tier2Body = (await tier2Cancel.json()) as { data: PublicOrderTracker };
    expect(tier2Body.data.status).toBe('cancelled');

    // Once an order is grilling, customer cancellation returns 409 ORDER_NOT_CANCELLABLE
    const grillingOrderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'Idempotency-Key': 'cancel-test-grilling-order-103',
      },
      body: JSON.stringify({
        customerName: 'Chef Locked',
        contactNumber: '09181112222',
        fulfillment: 'delivery',
        deliveryPin: { lat: 14.5608, lng: 121.0124 },
        addressOrNotes: 'Makati',
        paymentMethod: 'cash',
        items: [{ itemId: 'burger-deluxe', quantity: 2, addonIds: [] }],
      }),
    });
    const grillingCreated = (await grillingOrderRes.json()) as {
      data: OrderRecord;
      receiptToken: string;
    };

    await app.request(`/api/v1/admin/orders/${grillingCreated.data.id}/status`, {
      method: 'PATCH',
      headers: {
        ...CSRF_HEADERS,
        Cookie: 'eb_access_token=valid-access-token',
      },
      body: JSON.stringify({ status: 'grilling', expectedVersion: 1 }),
    });

    const lateTier1Cancel = await app.request(`/api/v1/orders/${grillingCreated.data.id}/cancel`, {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        'X-Order-Receipt-Token': grillingCreated.receiptToken,
      },
    });
    expect(lateTier1Cancel.status).toBe(409);

    const lateTier2Cancel = await app.request('/api/v1/orders/track/103/cancel', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ contactNumber: '+63 918 111 2222' }),
    });
    expect(lateTier2Cancel.status).toBe(409);

    // Admin orders filter & counts exclude cancelled from active and list cancelled orders
    const adminCancelledRes = await app.request('/api/v1/admin/orders?status=cancelled', {
      headers: { Cookie: 'eb_access_token=valid-access-token' },
    });
    expect(adminCancelledRes.status).toBe(200);
    const adminCancelledBody = (await adminCancelledRes.json()) as {
      data: OrderRecord[];
      counts: { all: number; active: number; cancelled: number; grilling: number };
    };
    expect(adminCancelledBody.data).toHaveLength(2);
    expect(adminCancelledBody.counts.cancelled).toBe(2);
    expect(adminCancelledBody.counts.active).toBe(1);
    expect(adminCancelledBody.counts.all).toBe(3);

    expect(pickupCreated.data.queueNumber).toBe('#8B-102');
  });
});

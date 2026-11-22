import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_ITEMS,
  MENU_ADDONS,
  calculateDeliveryQuote,
  slugifyMenuId,
  slugifyZoneId,
  type AdminUser,
  type DeliveryPricingConfig,
  type DeliveryZoneInput,
  type MenuItem,
  type MenuItemInput,
  type OrderRecord,
  type OrderStatus,
  type PlaceOrderRequest,
} from '@eight-burgers/contracts';
import { vi } from 'vitest';

export type MockApiOptions = {
  authenticated?: boolean;
  initialMenu?: MenuItem[];
  initialDeliveryPricing?: DeliveryPricingConfig;
  initialOrders?: OrderRecord[];
  onExternalFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const TEST_ADMIN_USER: AdminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@eightburgers.local',
  role: 'owner',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function problemJson(status: number, code: string, detail: string): Response {
  return new Response(
    JSON.stringify({
      type: `https://eight-burgers.local/problems/${code.toLowerCase()}`,
      title: code,
      status,
      code,
      detail,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  );
}

export function installMockShopApi(options: MockApiOptions = {}) {
  const state: {
    authenticated: boolean;
    menu: MenuItem[];
    deliveryPricing: DeliveryPricingConfig;
    orders: OrderRecord[];
    uploadedImages: Set<string>;
    nextQueueSeq: number;
    nextImageSeq: number;
  } = {
    authenticated: options.authenticated ?? false,
    menu: (options.initialMenu ?? DEFAULT_MENU_ITEMS).map((item) => ({
      ...item,
      version: item.version ?? 1,
    })),
    deliveryPricing: options.initialDeliveryPricing
      ? {
          zones: options.initialDeliveryPricing.zones.map((zone) => ({
            ...zone,
            version: zone.version ?? 1,
          })),
          freeDeliveryMinSubtotalPhp: options.initialDeliveryPricing.freeDeliveryMinSubtotalPhp,
          version: options.initialDeliveryPricing.version ?? 1,
        }
      : {
          zones: DEFAULT_DELIVERY_PRICING.zones.map((zone) => ({ ...zone, version: 1 })),
          freeDeliveryMinSubtotalPhp: DEFAULT_DELIVERY_PRICING.freeDeliveryMinSubtotalPhp,
          version: 1,
        },
    orders: (options.initialOrders ?? []).map((order) => ({
      ...order,
      version: order.version ?? 1,
    })),
    uploadedImages: new Set<string>(),
    nextQueueSeq: 101,
    nextImageSeq: 1,
  };

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!rawUrl.startsWith('/api/v1')) {
      if (options.onExternalFetch) {
        return options.onExternalFetch(input, init);
      }
      return jsonResponse([]);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const path = rawUrl.replace(/^\/api\/v1/, '').split('?')[0] ?? '/';
    const body =
      typeof init?.body === 'string' && init.body.length > 0 ? JSON.parse(init.body) : undefined;

    if (method === 'GET' && path === '/catalog') {
      return jsonResponse({
        data: {
          menu: state.menu,
          addons: [...MENU_ADDONS],
          deliveryPricing: state.deliveryPricing,
        },
      });
    }

    if (method === 'POST' && path === '/orders') {
      const req = body as PlaceOrderRequest;
      let subtotalPhp = 0;
      const lines = [];
      for (const line of req.items) {
        const item = state.menu.find((entry) => entry.id === line.itemId);
        if (!item || !item.available) {
          return problemJson(409, 'ITEM_UNAVAILABLE', `Item ${line.itemId} is sold out.`);
        }
        const addons = item.allowAddons
          ? MENU_ADDONS.filter((addon) => line.addonIds.includes(addon.id))
          : [];
        const addonsPricePhp = addons.reduce((sum, addon) => sum + addon.pricePhp, 0);
        const lineTotalPhp = (item.pricePhp + addonsPricePhp) * line.quantity;
        subtotalPhp += lineTotalPhp;
        lines.push({
          lineId:
            addons.length > 0
              ? `${item.id}__${addons
                  .map((a) => a.id)
                  .sort()
                  .join('+')}`
              : item.id,
          itemId: item.id,
          name: item.name,
          unitPricePhp: item.pricePhp,
          addonNames: addons.map((a) => a.name),
          addonsPricePhp,
          quantity: line.quantity,
          lineTotalPhp,
        });
      }

      const quote = calculateDeliveryQuote({
        fulfillment: req.fulfillment,
        subtotalPhp,
        deliveryPricing: state.deliveryPricing,
        zoneId: req.deliveryZoneId,
        pin: req.deliveryPin,
      });

      if (req.fulfillment === 'delivery' && (!quote.available || quote.outOfRange)) {
        return problemJson(422, 'OUT_OF_DELIVERY_RANGE', 'Delivery pin is outside active range.');
      }

      const totalPhp = subtotalPhp + quote.feePhp;
      if (req.expectedTotalPhp !== undefined && req.expectedTotalPhp !== totalPhp) {
        return problemJson(409, 'PRICE_CHANGED', `Updated total is ₱${totalPhp}.`);
      }

      const seq = state.nextQueueSeq;
      state.nextQueueSeq += 1;
      const order: OrderRecord = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        queueNumber: `#8B-${seq}`,
        customerName: req.customerName,
        contactNumber: req.contactNumber,
        fulfillment: req.fulfillment,
        ...(quote.zone
          ? {
              deliveryZoneId: quote.zone.id,
              deliveryZoneName: quote.zone.name,
              deliveryEtaMinutes: quote.zone.etaMinutes,
            }
          : {}),
        ...(req.fulfillment === 'delivery' && req.deliveryPin
          ? { deliveryPin: req.deliveryPin }
          : {}),
        ...(quote.distanceKm !== null ? { deliveryDistanceKm: quote.distanceKm } : {}),
        ...(quote.isFreeDelivery ? { deliveryFeeWaived: true } : {}),
        addressOrNotes: req.addressOrNotes,
        paymentMethod: req.paymentMethod,
        lines,
        subtotalPhp,
        deliveryFeePhp: quote.feePhp,
        totalPhp,
        status: 'received',
        createdAtIso: new Date().toISOString(),
        version: 1,
      };
      state.orders.unshift(order);
      return jsonResponse(
        { data: order, receiptToken: `receipt-token-${seq}-abcdef0123456789` },
        201,
      );
    }

    if (method === 'GET' && path.startsWith('/orders/')) {
      const orderId = path.slice('/orders/'.length);
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return problemJson(404, 'ORDER_NOT_FOUND', 'Order not found.');
      return jsonResponse({ data: order });
    }

    if (method === 'GET' && path === '/auth/session') {
      return jsonResponse({
        data: state.authenticated
          ? { authenticated: true, user: TEST_ADMIN_USER }
          : { authenticated: false, user: null },
      });
    }

    if (method === 'POST' && path === '/auth/login') {
      const creds = body as { email: string; password: string };
      if (creds.email === TEST_ADMIN_USER.email && creds.password === 'EightBurgersDev123!') {
        state.authenticated = true;
        return jsonResponse({ data: { authenticated: true, user: TEST_ADMIN_USER } });
      }
      return problemJson(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (method === 'POST' && path === '/auth/logout') {
      state.authenticated = false;
      return new Response(null, { status: 204 });
    }

    if (path.startsWith('/admin/')) {
      if (!state.authenticated) {
        return problemJson(401, 'UNAUTHENTICATED', 'Sign-in required.');
      }

      if (method === 'GET' && path === '/admin/orders') {
        const queryString = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
        const params = new URLSearchParams(queryString);
        const statusParam = params.get('status') ?? 'all';
        const rangeParam = params.get('range') ?? 'all';
        const sortParam = params.get('sort') ?? 'desc';
        const qParam = (params.get('q') ?? '').trim().toLowerCase();
        const cursorParam = params.get('cursor');
        const limitParam = params.get('limit');
        const numericLimit = limitParam ? Number(limitParam) : 50;
        const limit =
          Number.isFinite(numericLimit) && numericLimit > 0
            ? Math.min(100, Math.round(numericLimit))
            : 50;

        let rangeStartMs: number | null = null;
        if (rangeParam === '7d') {
          rangeStartMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        } else if (rangeParam === 'today') {
          const offsetMs = 8 * 60 * 60 * 1000;
          const manilaNow = new Date(Date.now() + offsetMs);
          rangeStartMs =
            Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate()) -
            offsetMs;
        }

        const baseFiltered = state.orders.filter((order) => {
          if (rangeStartMs !== null && Date.parse(order.createdAtIso) < rangeStartMs) {
            return false;
          }
          if (qParam) {
            const matches =
              order.queueNumber.toLowerCase().includes(qParam) ||
              order.customerName.toLowerCase().includes(qParam) ||
              order.contactNumber.toLowerCase().includes(qParam) ||
              (order.deliveryZoneName?.toLowerCase().includes(qParam) ?? false);
            if (!matches) return false;
          }
          return true;
        });

        const counts = {
          all: baseFiltered.length,
          active: baseFiltered.filter((order) => order.status !== 'completed').length,
          received: baseFiltered.filter((order) => order.status === 'received').length,
          grilling: baseFiltered.filter((order) => order.status === 'grilling').length,
          ready: baseFiltered.filter((order) => order.status === 'ready').length,
          completed: baseFiltered.filter((order) => order.status === 'completed').length,
        };

        const statusFiltered = baseFiltered.filter((order) => {
          if (statusParam === 'all') return true;
          if (statusParam === 'active') return order.status !== 'completed';
          return order.status === statusParam;
        });

        const ascending = sortParam === 'asc';
        const sorted = [...statusFiltered].sort((a, b) => {
          const timeCmp = a.createdAtIso.localeCompare(b.createdAtIso);
          const cmp = timeCmp !== 0 ? timeCmp : a.id.localeCompare(b.id);
          return ascending ? cmp : -cmp;
        });

        let filtered = sorted;
        if (cursorParam) {
          const sep = cursorParam.indexOf('|');
          const cursorTs = sep > 0 ? cursorParam.slice(0, sep) : cursorParam;
          const cursorId = sep > 0 ? cursorParam.slice(sep + 1) : '';
          filtered = sorted.filter((order) => {
            const timeCmp = order.createdAtIso.localeCompare(cursorTs);
            const cmp = timeCmp !== 0 ? timeCmp : order.id.localeCompare(cursorId);
            return ascending ? cmp > 0 : cmp < 0;
          });
        }

        const hasMore = filtered.length > limit;
        const page = hasMore ? filtered.slice(0, limit) : filtered;
        const last = page[page.length - 1];
        const nextCursor = hasMore && last ? `${last.createdAtIso}|${last.id}` : null;
        return jsonResponse({ data: page, nextCursor, ...(!cursorParam ? { counts } : {}) });
      }

      if (method === 'PATCH' && path.startsWith('/admin/orders/') && path.endsWith('/status')) {
        const orderId = path.slice('/admin/orders/'.length, -'/status'.length);
        const order = state.orders.find((entry) => entry.id === orderId);
        if (!order) return problemJson(404, 'ORDER_NOT_FOUND', 'Order not found.');
        const payload = body as { status: OrderStatus; expectedVersion?: number };
        if (payload.expectedVersion !== undefined && order.version !== payload.expectedVersion) {
          return problemJson(409, 'CONFLICT', 'Order status was updated on another device.');
        }
        order.status = payload.status;
        order.version = (order.version ?? 1) + 1;
        return jsonResponse({ data: order });
      }

      if (method === 'POST' && path === '/admin/menu-images') {
        const formData = init?.body;
        if (!(formData instanceof FormData) || !(formData.get('file') instanceof File)) {
          return problemJson(400, 'IMAGE_FILE_REQUIRED', 'Attach an image file.');
        }
        const seq = state.nextImageSeq;
        state.nextImageSeq += 1;
        const uuid = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
        const objectPath = `items/${uuid}.webp`;
        const imageUrl = `/storage/v1/object/public/menu-images/${objectPath}`;
        state.uploadedImages.add(imageUrl);
        return jsonResponse(
          {
            data: {
              imageUrl,
              path: objectPath,
              sizeBytes: 42_500,
              width: 1200,
              height: 800,
              contentType: 'image/webp',
            },
          },
          201,
        );
      }

      if (method === 'DELETE' && path === '/admin/menu-images') {
        const payload = body as { imageUrl?: string } | undefined;
        const targetUrl = payload?.imageUrl;
        if (targetUrl && !state.menu.some((item) => item.imageUrl === targetUrl)) {
          state.uploadedImages.delete(targetUrl);
        }
        return new Response(null, { status: 204 });
      }

      if (method === 'POST' && path === '/admin/menu-items/reset') {
        state.menu = DEFAULT_MENU_ITEMS.map((item) => ({ ...item, version: 1 }));
        state.uploadedImages.clear();
        return jsonResponse({ data: state.menu });
      }

      if (method === 'POST' && path === '/admin/menu-items') {
        const input = body as MenuItemInput;
        const id = slugifyMenuId(input.name, new Set(state.menu.map((item) => item.id)));
        const created: MenuItem = { id, ...input, version: 1 };
        state.menu.unshift(created);
        return jsonResponse({ data: created }, 201);
      }

      if (method === 'PUT' && path.startsWith('/admin/menu-items/')) {
        const id = path.slice('/admin/menu-items/'.length);
        const idx = state.menu.findIndex((item) => item.id === id);
        if (idx === -1) return problemJson(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found.');
        const existing = state.menu[idx];
        const { expectedVersion, ...input } = body as MenuItemInput & { expectedVersion?: number };
        if (expectedVersion !== undefined && existing?.version !== expectedVersion) {
          return problemJson(409, 'CONFLICT', 'Menu item was updated on another device.');
        }
        const updated: MenuItem = { id, ...input, version: (existing?.version ?? 1) + 1 };
        state.menu[idx] = updated;
        return jsonResponse({ data: updated });
      }

      if (
        method === 'PATCH' &&
        path.startsWith('/admin/menu-items/') &&
        path.endsWith('/availability')
      ) {
        const id = path.slice('/admin/menu-items/'.length, -'/availability'.length);
        const item = state.menu.find((entry) => entry.id === id);
        if (!item) return problemJson(404, 'MENU_ITEM_NOT_FOUND', 'Menu item not found.');
        const payload = body as { available: boolean; expectedVersion?: number };
        if (payload.expectedVersion !== undefined && item.version !== payload.expectedVersion) {
          return problemJson(409, 'CONFLICT', 'Menu item was updated on another device.');
        }
        item.available = Boolean(payload.available);
        item.version = (item.version ?? 1) + 1;
        return jsonResponse({ data: item });
      }

      if (method === 'DELETE' && path.startsWith('/admin/menu-items/')) {
        const id = path.slice('/admin/menu-items/'.length);
        state.menu = state.menu.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      }

      if (method === 'PATCH' && path === '/admin/delivery-pricing') {
        const payload = body as {
          freeDeliveryMinSubtotalPhp: number | null;
          expectedVersion?: number;
        };
        if (
          payload.expectedVersion !== undefined &&
          state.deliveryPricing.version !== payload.expectedVersion
        ) {
          return problemJson(409, 'CONFLICT', 'Delivery pricing was updated on another device.');
        }
        state.deliveryPricing.freeDeliveryMinSubtotalPhp = payload.freeDeliveryMinSubtotalPhp;
        state.deliveryPricing.version = (state.deliveryPricing.version ?? 1) + 1;
        return jsonResponse({ data: state.deliveryPricing });
      }

      if (method === 'POST' && path === '/admin/delivery-pricing/reset') {
        state.deliveryPricing = {
          zones: DEFAULT_DELIVERY_PRICING.zones.map((zone) => ({ ...zone, version: 1 })),
          freeDeliveryMinSubtotalPhp: DEFAULT_DELIVERY_PRICING.freeDeliveryMinSubtotalPhp,
          version: (state.deliveryPricing.version ?? 1) + 1,
        };
        return jsonResponse({ data: state.deliveryPricing });
      }

      if (method === 'POST' && path === '/admin/delivery-zones') {
        const input = body as DeliveryZoneInput;
        const id = slugifyZoneId(
          input.name,
          new Set(state.deliveryPricing.zones.map((zone) => zone.id)),
        );
        const created = { id, ...input, version: 1 };
        state.deliveryPricing.zones.push(created);
        return jsonResponse({ data: created }, 201);
      }

      if (method === 'PUT' && path.startsWith('/admin/delivery-zones/')) {
        const id = path.slice('/admin/delivery-zones/'.length);
        const idx = state.deliveryPricing.zones.findIndex((zone) => zone.id === id);
        if (idx === -1) return problemJson(404, 'DELIVERY_ZONE_NOT_FOUND', 'Zone not found.');
        const existing = state.deliveryPricing.zones[idx];
        const { expectedVersion, ...input } = body as DeliveryZoneInput & {
          expectedVersion?: number;
        };
        if (expectedVersion !== undefined && existing?.version !== expectedVersion) {
          return problemJson(409, 'CONFLICT', 'Delivery zone was updated on another device.');
        }
        const updated = { id, ...input, version: (existing?.version ?? 1) + 1 };
        state.deliveryPricing.zones[idx] = updated;
        return jsonResponse({ data: updated });
      }

      if (
        method === 'PATCH' &&
        path.startsWith('/admin/delivery-zones/') &&
        path.endsWith('/enabled')
      ) {
        const id = path.slice('/admin/delivery-zones/'.length, -'/enabled'.length);
        const zone = state.deliveryPricing.zones.find((entry) => entry.id === id);
        if (!zone) return problemJson(404, 'DELIVERY_ZONE_NOT_FOUND', 'Zone not found.');
        const payload = body as { enabled: boolean; expectedVersion?: number };
        if (payload.expectedVersion !== undefined && zone.version !== payload.expectedVersion) {
          return problemJson(409, 'CONFLICT', 'Delivery zone was updated on another device.');
        }
        zone.enabled = Boolean(payload.enabled);
        zone.version = (zone.version ?? 1) + 1;
        return jsonResponse({ data: zone });
      }

      if (method === 'DELETE' && path.startsWith('/admin/delivery-zones/')) {
        const id = path.slice('/admin/delivery-zones/'.length);
        state.deliveryPricing.zones = state.deliveryPricing.zones.filter((zone) => zone.id !== id);
        return new Response(null, { status: 204 });
      }
    }

    return problemJson(404, 'NOT_FOUND', `Unhandled mock route: ${method} ${path}`);
  });

  return { spy, state };
}

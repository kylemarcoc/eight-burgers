import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  DEFAULT_OPTION_GROUPS,
  DEFAULT_PAYMENT_METHODS,
  STORE_ORIGIN_COORDS,
  buildCartLineId,
  calculateDeliveryQuote,
  canCustomerCancelOrder,
  normalizeContactDigits,
  normalizeItemNote,
  normalizeQueueNumber,
  slugifyCategoryId,
  slugifyMenuId,
  slugifyOptionChoiceId,
  slugifyOptionGroupId,
  validateItemOptionSelections,
  type AdminRole,
  type AdminTeamMember,
  type AdminUser,
  type CancelPublicOrderByQueueRequest,
  type CreateAdminUserRequest,
  type DeliveryPricingConfig,
  type DeliveryPricingPatch,
  type GeoCoordinates,
  type LocationSuggestion,
  type MenuCategory,
  type MenuCategoryInput,
  type MenuCategoryPatch,
  type MenuItem,
  type MenuItemInput,
  type OptionChoice,
  type OptionGroup,
  type OptionGroupInput,
  type OptionGroupPatch,
  type OrderRecord,
  type OrderStatus,
  type PaymentStatus,
  type PlaceOrderRequest,
  type PublicOrderTracker,
  type ReorderIdsRequest,
  type StoreAssetUploadPurpose,
  type StoreOrderingStatusPatch,
  type StoreProfile,
  type StoreProfilePatch,
  type UpdateAdminUserRequest,
} from '@menu-kiosk/contracts';
import { vi } from 'vitest';

const DEFAULT_DEMO_STORE_PROFILE: StoreProfile = {
  storeName: '8Burgers',
  branchLabel: 'Chino Roces Avenue, Makati',
  monogram: '8B',
  heroHeadline: '100g pure beef griddle burgers, made fresh on Chino Roces.',
  heroSubtext:
    'Walk up beside Pickup Coffee near Eton WestEnd Square or place an order for delivery.',
  heroBadgeLabel: '100g Pure Beef',
  address: 'Chino Roces Avenue, Makati',
  landmark: 'Beside Pickup Coffee, near Eton WestEnd Square',
  contactPhone: '(0916) 520-5707',
  hoursText: 'Daily · 10:00 AM – 11:00 PM',
  pickupSpotLabel: 'Chino Roces Pickup',
  logoUrl: '',
  heroImageUrl: '/images/menu/hero-banner.webp',
  externalLinks: [
    {
      label: 'Foodpanda',
      url: 'https://www.foodpanda.ph/restaurant/om5p/8burgers-chino-roces-avenue',
    },
    {
      label: 'Facebook',
      url: 'https://www.facebook.com/p/8Burgers-61556691506190/',
    },
  ],
  queuePrefix: '8B',
  preparingStageLabel: 'On the Grill',
  themeAccentPreset: 'ember',
  themeAccentHex: null,
  acceptingOrders: true,
  closedNotice: '',
  pickupEnabled: true,
  deliveryEnabled: true,
  dineInEnabled: false,
  dineInTableRequired: true,
  paymentMethods: {
    cash: { ...DEFAULT_PAYMENT_METHODS.cash, enabled: true },
    gcash: { ...DEFAULT_PAYMENT_METHODS.gcash, enabled: true },
    maya: { ...DEFAULT_PAYMENT_METHODS.maya, enabled: true },
    bank_transfer: { ...DEFAULT_PAYMENT_METHODS.bank_transfer, enabled: false },
  },
  originCoords: STORE_ORIGIN_COORDS,
  version: 1,
};

function toPublicOrderTracker(order: OrderRecord): PublicOrderTracker {
  return {
    queueNumber: order.queueNumber,
    fulfillment: order.fulfillment,
    tableNumber: order.tableNumber ?? '',
    hasContactNumber: order.contactNumber.trim().length > 0,
    paymentStatus: order.paymentStatus ?? 'unpaid',
    ...(order.deliveryEtaMinutes ? { deliveryEtaMinutes: order.deliveryEtaMinutes } : {}),
    lines: order.lines.map((line) => {
      const optionNames =
        line.selectedOptions && line.selectedOptions.length > 0
          ? line.selectedOptions.map((option) => option.choiceName)
          : line.addonNames;
      return {
        lineId: line.lineId,
        name: line.name,
        quantity: line.quantity,
        addonNames: optionNames,
        selectedOptionNames: optionNames,
      };
    }),
    status: order.status,
    createdAtIso: order.createdAtIso,
    ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}),
  };
}

export type MockApiOptions = {
  authenticated?: boolean;
  role?: AdminRole;
  user?: AdminUser;
  initialStore?: Partial<StoreProfile>;
  initialCategories?: MenuCategory[];
  initialOptionGroups?: OptionGroup[];
  initialMenu?: MenuItem[];
  initialDeliveryPricing?: DeliveryPricingConfig;
  initialOrders?: OrderRecord[];
  enableDemoReset?: boolean;
  locationSuggestions?: LocationSuggestion[];
  onLocationSearch?: (query: string) => Response | Promise<Response>;
  onLocationReverse?: (coords: GeoCoordinates) => Response | Promise<Response>;
  onExternalFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const DEFAULT_LOCATION_SUGGESTIONS: LocationSuggestion[] = [
  {
    id: 'mock-chino-roces',
    label: 'Chino Roces Avenue',
    secondaryLabel: 'San Antonio, Makati, Metro Manila',
    coordinates: { lat: 14.5608, lng: 121.0124 },
  },
  {
    id: 'mock-ayala-triangle',
    label: 'Ayala Triangle Gardens',
    secondaryLabel: 'Ayala Avenue, Bel-Air, Makati',
    coordinates: { lat: 14.5572, lng: 121.0236 },
  },
  {
    id: 'mock-bgc-high-street',
    label: 'Bonifacio High Street',
    secondaryLabel: 'BGC, Taguig, Metro Manila',
    coordinates: { lat: 14.5508, lng: 121.0505 },
  },
  {
    id: 'mock-filinvest-alabang',
    label: 'Filinvest City Alabang',
    secondaryLabel: 'Alabang, Muntinlupa, Metro Manila',
    coordinates: { lat: 14.417, lng: 121.041 },
  },
  {
    id: 'mock-tagaytay-rotonda',
    label: 'Tagaytay Rotonda',
    secondaryLabel: 'Silang Junction South, Tagaytay, Cavite',
    coordinates: { lat: 14.1153, lng: 120.9621 },
  },
];

const TEST_ADMIN_USERS: Record<AdminRole, AdminUser> = {
  owner: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@eightburgers.local',
    role: 'owner',
  },
  cashier: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'cashier@eightburgers.local',
    role: 'cashier',
  },
  staff: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'staff@eightburgers.local',
    role: 'staff',
  },
};

const TEST_USERS_BY_EMAIL = new Map<string, AdminUser>(
  Object.values(TEST_ADMIN_USERS).map((user) => [user.email, user]),
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function problemJson(status: number, code: string, detail: string): Response {
  return new Response(
    JSON.stringify({
      type: `https://api.menu-kiosk.local/problems/${code.toLowerCase()}`,
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
  const initialUser = options.user ?? TEST_ADMIN_USERS[options.role ?? 'owner'];
  const initialOriginCoords =
    options.initialDeliveryPricing?.originCoords !== undefined
      ? options.initialDeliveryPricing.originCoords
      : options.initialStore?.originCoords !== undefined
        ? options.initialStore.originCoords
        : DEFAULT_DEMO_STORE_PROFILE.originCoords;
  const initialDeliveryEnabled =
    options.initialDeliveryPricing?.deliveryEnabled !== undefined
      ? options.initialDeliveryPricing.deliveryEnabled
      : options.initialStore?.deliveryEnabled !== undefined
        ? options.initialStore.deliveryEnabled
        : DEFAULT_DEMO_STORE_PROFILE.deliveryEnabled;
  const initialPaymentMethods = {
    cash: {
      ...DEFAULT_DEMO_STORE_PROFILE.paymentMethods.cash,
      ...options.initialStore?.paymentMethods?.cash,
    },
    gcash: {
      ...DEFAULT_DEMO_STORE_PROFILE.paymentMethods.gcash,
      ...options.initialStore?.paymentMethods?.gcash,
    },
    maya: {
      ...DEFAULT_DEMO_STORE_PROFILE.paymentMethods.maya,
      ...options.initialStore?.paymentMethods?.maya,
    },
    bank_transfer: {
      ...DEFAULT_DEMO_STORE_PROFILE.paymentMethods.bank_transfer,
      ...options.initialStore?.paymentMethods?.bank_transfer,
    },
  };

  const state: {
    authenticated: boolean;
    activeUser: AdminUser | null;
    team: AdminTeamMember[];
    store: StoreProfile;
    categories: MenuCategory[];
    optionGroups: OptionGroup[];
    menu: MenuItem[];
    deliveryPricing: DeliveryPricingConfig;
    orders: OrderRecord[];
    uploadedImages: Set<string>;
    nextQueueSeq: number;
    nextImageSeq: number;
    nextUserSeq: number;
  } = {
    authenticated: options.authenticated ?? false,
    activeUser: options.authenticated ? initialUser : null,
    team: Object.values(TEST_ADMIN_USERS).map((user) => ({
      ...user,
      active: true,
      createdAt: '2026-11-22T01:00:00.000Z',
      updatedAt: '2026-11-22T01:00:00.000Z',
    })),
    store: {
      ...DEFAULT_DEMO_STORE_PROFILE,
      ...options.initialStore,
      deliveryEnabled: initialDeliveryEnabled,
      paymentMethods: initialPaymentMethods,
      externalLinks: (
        options.initialStore?.externalLinks ?? DEFAULT_DEMO_STORE_PROFILE.externalLinks
      ).map((link) => ({ ...link })),
      originCoords: initialOriginCoords ? { ...initialOriginCoords } : null,
      version: options.initialStore?.version ?? 1,
    },
    categories: (options.initialCategories ?? DEFAULT_MENU_CATEGORIES).map((category) => ({
      ...category,
      version: category.version ?? 1,
    })),
    optionGroups: (options.initialOptionGroups ?? DEFAULT_OPTION_GROUPS).map((group) => ({
      ...group,
      version: group.version ?? 1,
      choices: group.choices.map((choice) => ({
        ...choice,
        version: choice.version ?? 1,
      })),
    })),
    menu: (options.initialMenu ?? DEFAULT_MENU_ITEMS).map((item) => ({
      ...item,
      optionGroupIds: [...item.optionGroupIds],
      version: item.version ?? 1,
    })),
    deliveryPricing: options.initialDeliveryPricing
      ? {
          ...options.initialDeliveryPricing,
          deliveryEnabled: initialDeliveryEnabled,
          originCoords: initialOriginCoords ? { ...initialOriginCoords } : null,
          version: options.initialDeliveryPricing.version ?? 1,
        }
      : {
          ...DEFAULT_DELIVERY_PRICING,
          deliveryEnabled: initialDeliveryEnabled,
          originCoords: initialOriginCoords ? { ...initialOriginCoords } : null,
          version: 1,
        },
    orders: (options.initialOrders ?? []).map((order) => ({
      ...order,
      tableNumber: order.tableNumber ?? '',
      paymentStatus: order.paymentStatus ?? 'unpaid',
      paymentReference: order.paymentReference ?? '',
      version: order.version ?? 1,
    })),
    uploadedImages: new Set<string>(),
    nextQueueSeq: 101,
    nextImageSeq: 1,
    nextUserSeq: 4,
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
          store: state.store,
          categories: state.categories,
          optionGroups: state.optionGroups,
          menu: state.menu,
          deliveryPricing: state.deliveryPricing,
        },
      });
    }

    if (method === 'GET' && path === '/location/search') {
      const queryString = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
      const params = new URLSearchParams(queryString);
      const q = (params.get('q') ?? '').trim();
      if (options.onLocationSearch) {
        return options.onLocationSearch(q);
      }
      if (q.length < 2) {
        return problemJson(
          400,
          'VALIDATION_ERROR',
          'Provide an address search query between 2 and 120 characters.',
        );
      }
      const lower = q.toLowerCase();
      const source = options.locationSuggestions ?? DEFAULT_LOCATION_SUGGESTIONS;
      const matches = source.filter(
        (item) =>
          item.label.toLowerCase().includes(lower) ||
          (item.secondaryLabel?.toLowerCase().includes(lower) ?? false),
      );
      return jsonResponse({ data: matches.slice(0, 6) });
    }

    if (method === 'GET' && path === '/location/reverse') {
      const queryString = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
      const params = new URLSearchParams(queryString);
      const lat = Number(params.get('lat'));
      const lng = Number(params.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return problemJson(400, 'VALIDATION_ERROR', 'Provide valid coordinates.');
      }
      if (options.onLocationReverse) {
        return options.onLocationReverse({ lat, lng });
      }
      return jsonResponse({
        data: {
          label: 'Chino Roces Avenue, San Antonio, Makati',
          coordinates: { lat, lng },
        },
      });
    }

    if (method === 'POST' && path === '/orders') {
      const req = body as PlaceOrderRequest;
      if (!state.store.acceptingOrders) {
        return problemJson(
          422,
          'STORE_CLOSED',
          state.store.closedNotice || 'The store is currently paused and not accepting new orders.',
        );
      }
      if (req.fulfillment === 'pickup' && !state.store.pickupEnabled) {
        return problemJson(422, 'FULFILLMENT_UNAVAILABLE', 'Pickup is currently unavailable.');
      }
      if (req.fulfillment === 'dine-in' && !state.store.dineInEnabled) {
        return problemJson(422, 'FULFILLMENT_UNAVAILABLE', 'Dine-in is currently unavailable.');
      }
      const trimmedTableNumber = (req.tableNumber ?? '').trim();
      if (req.fulfillment === 'dine-in' && state.store.dineInTableRequired && !trimmedTableNumber) {
        return problemJson(400, 'TABLE_NUMBER_REQUIRED', 'Enter your table number for dine-in.');
      }
      if (!state.store.paymentMethods[req.paymentMethod]?.enabled) {
        return problemJson(
          422,
          'PAYMENT_METHOD_UNAVAILABLE',
          'Selected payment method is currently unavailable.',
        );
      }
      if (req.fulfillment === 'delivery' && !req.deliveryPin) {
        return problemJson(
          400,
          'VALIDATION_ERROR',
          'Select a delivery address from the suggestions or use your device location.',
        );
      }
      let subtotalPhp = 0;
      const lines = [];
      for (const line of req.items) {
        const item = state.menu.find((entry) => entry.id === line.itemId);
        if (!item || !item.available) {
          return problemJson(409, 'ITEM_UNAVAILABLE', `Item ${line.itemId} is sold out.`);
        }
        const optionCheck = validateItemOptionSelections(
          item,
          line.selectedOptionIds ?? [],
          state.optionGroups,
        );
        if (!optionCheck.valid) {
          const firstIssue = optionCheck.issues[0];
          return problemJson(
            422,
            firstIssue?.code ?? 'INVALID_OPTION_SELECTION',
            firstIssue?.message ?? 'Invalid option selection.',
          );
        }
        const trimmedNote = normalizeItemNote(line.itemNote);
        const lineTotalPhp = (item.pricePhp + optionCheck.addonsPricePhp) * line.quantity;
        subtotalPhp += lineTotalPhp;
        lines.push({
          lineId: buildCartLineId(item.id, line.selectedOptionIds ?? [], trimmedNote),
          itemId: item.id,
          name: item.name,
          unitPricePhp: item.pricePhp,
          selectedOptions: optionCheck.selectedOptions,
          addonNames: optionCheck.selectedOptions.map((opt) => opt.choiceName),
          itemNote: trimmedNote,
          addonsPricePhp: optionCheck.addonsPricePhp,
          quantity: line.quantity,
          lineTotalPhp,
        });
      }

      if (
        req.fulfillment === 'delivery' &&
        (!state.deliveryPricing.deliveryEnabled || !state.deliveryPricing.originCoords)
      ) {
        return problemJson(
          422,
          'DELIVERY_UNAVAILABLE',
          'Delivery is currently paused. Switch to pickup to continue.',
        );
      }

      const quote = calculateDeliveryQuote({
        fulfillment: req.fulfillment,
        subtotalPhp,
        deliveryPricing: state.deliveryPricing,
        pin: req.deliveryPin,
        storeOrigin: state.deliveryPricing.originCoords,
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
      const trimmedPaymentRef =
        req.paymentMethod !== 'cash' ? (req.paymentReference ?? '').trim() : '';
      const initialPaymentStatus: PaymentStatus =
        req.paymentMethod !== 'cash' && trimmedPaymentRef.length > 0
          ? 'pending_verification'
          : 'unpaid';
      const order: OrderRecord = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        queueNumber: `#${state.store.queuePrefix}-${seq}`,
        customerName: req.customerName,
        contactNumber: req.contactNumber,
        fulfillment: req.fulfillment,
        tableNumber: req.fulfillment === 'dine-in' ? trimmedTableNumber : '',
        ...(req.fulfillment === 'delivery' && quote.etaMinutes
          ? { deliveryEtaMinutes: quote.etaMinutes }
          : {}),
        ...(req.fulfillment === 'delivery' && req.deliveryPin
          ? { deliveryPin: req.deliveryPin }
          : {}),
        ...(quote.distanceKm !== null ? { deliveryDistanceKm: quote.distanceKm } : {}),
        ...(quote.isFreeDelivery ? { deliveryFeeWaived: true } : {}),
        addressOrNotes: req.addressOrNotes,
        paymentMethod: req.paymentMethod,
        paymentStatus: initialPaymentStatus,
        paymentReference: trimmedPaymentRef,
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

    if (method === 'GET' && path.startsWith('/orders/track/')) {
      const rawQueue = decodeURIComponent(path.slice('/orders/track/'.length));
      const normalized = normalizeQueueNumber(rawQueue, state.store.queuePrefix);
      const order = state.orders.find(
        (entry) => normalizeQueueNumber(entry.queueNumber, state.store.queuePrefix) === normalized,
      );
      if (!order)
        return problemJson(404, 'ORDER_NOT_FOUND', 'No order found for that queue number.');
      return jsonResponse({ data: toPublicOrderTracker(order) });
    }

    if (method === 'POST' && path.startsWith('/orders/track/') && path.endsWith('/cancel')) {
      const rawQueue = decodeURIComponent(path.slice('/orders/track/'.length, -'/cancel'.length));
      const normalized = normalizeQueueNumber(rawQueue, state.store.queuePrefix);
      const order = state.orders.find(
        (entry) => normalizeQueueNumber(entry.queueNumber, state.store.queuePrefix) === normalized,
      );
      if (!order)
        return problemJson(404, 'ORDER_NOT_FOUND', 'No order found for that queue number.');

      const payload = (body ?? {}) as CancelPublicOrderByQueueRequest;
      const orderDigits = normalizeContactDigits(order.contactNumber);
      const inputDigits = normalizeContactDigits(payload.contactNumber ?? '');

      const verified = Boolean(orderDigits && inputDigits && orderDigits === inputDigits);

      if (!verified) {
        return problemJson(
          403,
          'ORDER_VERIFICATION_FAILED',
          'The verification details entered do not match this order.',
        );
      }

      if (order.status !== 'cancelled' && !canCustomerCancelOrder(order)) {
        return problemJson(
          409,
          'ORDER_NOT_CANCELLABLE',
          'This order can no longer be cancelled online.',
        );
      }

      order.status = 'cancelled';
      order.version = (order.version ?? 1) + 1;
      return jsonResponse({ data: toPublicOrderTracker(order) });
    }

    if (method === 'POST' && path.startsWith('/orders/') && path.endsWith('/payment-reference')) {
      const orderId = path.slice('/orders/'.length, -'/payment-reference'.length);
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return problemJson(404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (order.status === 'cancelled') {
        return problemJson(
          409,
          'ORDER_CANCELLED',
          'Cannot submit payment reference for a cancelled order.',
        );
      }
      if (order.paymentMethod === 'cash') {
        return problemJson(
          400,
          'PAYMENT_REFERENCE_NOT_SUPPORTED',
          'Cash orders do not accept payment references.',
        );
      }
      if (order.paymentStatus === 'paid') {
        return problemJson(409, 'ORDER_ALREADY_PAID', 'Order is already marked paid.');
      }
      const payload = (body ?? {}) as { paymentReference?: string };
      const trimmedRef = (payload.paymentReference ?? '').trim();
      if (!trimmedRef) {
        return problemJson(400, 'VALIDATION_ERROR', 'Enter your payment reference number.');
      }
      order.paymentReference = trimmedRef;
      order.paymentStatus = 'pending_verification';
      order.version = (order.version ?? 1) + 1;
      return jsonResponse({ data: order });
    }

    if (method === 'POST' && path.startsWith('/orders/') && path.endsWith('/cancel')) {
      const orderId = path.slice('/orders/'.length, -'/cancel'.length);
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return problemJson(404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (order.status !== 'cancelled' && !canCustomerCancelOrder(order)) {
        return problemJson(
          409,
          'ORDER_NOT_CANCELLABLE',
          'This order can no longer be cancelled online.',
        );
      }
      order.status = 'cancelled';
      order.version = (order.version ?? 1) + 1;
      return jsonResponse({ data: order });
    }

    if (method === 'GET' && path.startsWith('/orders/')) {
      const orderId = path.slice('/orders/'.length);
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return problemJson(404, 'ORDER_NOT_FOUND', 'Order not found.');
      return jsonResponse({ data: order });
    }

    if (method === 'GET' && path === '/auth/session') {
      return jsonResponse({
        data:
          state.authenticated && state.activeUser
            ? { authenticated: true, user: state.activeUser }
            : { authenticated: false, user: null },
      });
    }

    if (method === 'POST' && path === '/auth/login') {
      const creds = body as { email: string; password: string };
      const matchedUser = TEST_USERS_BY_EMAIL.get(creds.email);
      if (matchedUser && creds.password === 'EightBurgersDev123!') {
        state.authenticated = true;
        state.activeUser = matchedUser;
        return jsonResponse({ data: { authenticated: true, user: matchedUser } });
      }
      return problemJson(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (method === 'POST' && path === '/auth/logout') {
      state.authenticated = false;
      state.activeUser = null;
      return new Response(null, { status: 204 });
    }

    if (path.startsWith('/admin/')) {
      if (!state.authenticated || !state.activeUser) {
        return problemJson(401, 'UNAUTHENTICATED', 'Sign-in required.');
      }

      const isOwner = state.activeUser.role === 'owner';
      const isCashier = state.activeUser.role === 'cashier';
      const isAvailabilityPatch =
        method === 'PATCH' &&
        ((path.startsWith('/admin/menu-items/') && path.endsWith('/availability')) ||
          (path.startsWith('/admin/option-choices/') && path.endsWith('/availability')));
      const isOrderingStatusPatch = method === 'PATCH' && path === '/admin/store-ordering-status';
      const isPaymentStatusPatch =
        method === 'PATCH' && path.startsWith('/admin/orders/') && path.endsWith('/payment-status');
      const isOrderRoute =
        (path === '/admin/orders' || path.startsWith('/admin/orders/')) && !isPaymentStatusPatch;
      if (
        !isOwner &&
        !isOrderRoute &&
        !isAvailabilityPatch &&
        !(isCashier && (isOrderingStatusPatch || isPaymentStatusPatch))
      ) {
        return problemJson(
          403,
          'INSUFFICIENT_ROLE',
          'Your Staff Portal role does not have permission to perform this action.',
        );
      }

      if (method === 'POST' && path === '/admin/categories/reorder') {
        const payload = body as ReorderIdsRequest;
        const byId = new Map(state.categories.map((cat) => [cat.id, cat]));
        const reordered: MenuCategory[] = [];
        payload.orderedIds.forEach((id, index) => {
          const cat = byId.get(id);
          if (cat) {
            cat.sortOrder = index + 1;
            cat.version = (cat.version ?? 1) + 1;
            reordered.push(cat);
            byId.delete(id);
          }
        });
        for (const remaining of byId.values()) {
          remaining.sortOrder = reordered.length + 1;
          reordered.push(remaining);
        }
        state.categories = reordered;
        return jsonResponse({ data: state.categories });
      }

      if (method === 'POST' && path === '/admin/categories') {
        const input = body as MenuCategoryInput;
        const id =
          input.id ?? slugifyCategoryId(input.name, new Set(state.categories.map((cat) => cat.id)));
        if (state.categories.some((cat) => cat.id === id)) {
          return problemJson(409, 'CATEGORY_ALREADY_EXISTS', 'Category already exists.');
        }
        const created: MenuCategory = {
          id,
          name: input.name.trim(),
          description: (input.description ?? '').trim(),
          sortOrder: input.sortOrder ?? state.categories.length + 1,
          active: input.active ?? true,
          version: 1,
        };
        state.categories.push(created);
        return jsonResponse({ data: created }, 201);
      }

      if (method === 'PATCH' && path.startsWith('/admin/categories/')) {
        const id = decodeURIComponent(path.slice('/admin/categories/'.length));
        const category = state.categories.find((cat) => cat.id === id);
        if (!category) return problemJson(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
        const patch = body as MenuCategoryPatch;
        if (patch.expectedVersion !== undefined && category.version !== patch.expectedVersion) {
          return problemJson(409, 'CONFLICT', 'Category was updated on another device.');
        }
        if (patch.name !== undefined) category.name = patch.name.trim();
        if (patch.description !== undefined) category.description = patch.description.trim();
        if (patch.sortOrder !== undefined) category.sortOrder = patch.sortOrder;
        if (patch.active !== undefined) category.active = patch.active;
        category.version = (category.version ?? 1) + 1;
        return jsonResponse({ data: category });
      }

      if (method === 'DELETE' && path.startsWith('/admin/categories/')) {
        const id = decodeURIComponent(path.slice('/admin/categories/'.length));
        if (!state.categories.some((cat) => cat.id === id)) {
          return problemJson(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
        }
        if (state.menu.some((item) => item.category === id)) {
          return problemJson(
            409,
            'CATEGORY_IN_USE',
            'Move or delete menu items assigned to this category before deleting it.',
          );
        }
        state.categories = state.categories.filter((cat) => cat.id !== id);
        return new Response(null, { status: 204 });
      }

      if (method === 'POST' && path === '/admin/option-groups/reorder') {
        const payload = body as ReorderIdsRequest;
        const byId = new Map(state.optionGroups.map((group) => [group.id, group]));
        const reordered: OptionGroup[] = [];
        payload.orderedIds.forEach((id, index) => {
          const group = byId.get(id);
          if (group) {
            group.sortOrder = index + 1;
            group.version = (group.version ?? 1) + 1;
            reordered.push(group);
            byId.delete(id);
          }
        });
        for (const remaining of byId.values()) {
          remaining.sortOrder = reordered.length + 1;
          reordered.push(remaining);
        }
        state.optionGroups = reordered;
        return jsonResponse({ data: state.optionGroups });
      }

      if (method === 'POST' && path === '/admin/option-groups') {
        const input = body as OptionGroupInput;
        const id =
          input.id ??
          slugifyOptionGroupId(input.name, new Set(state.optionGroups.map((group) => group.id)));
        const existingChoiceIds = new Set<string>(
          state.optionGroups.flatMap((group) => group.choices.map((choice) => choice.id)),
        );
        const choices: OptionChoice[] = (input.choices ?? []).map((choice, idx) => {
          const choiceId = choice.id ?? slugifyOptionChoiceId(choice.name, existingChoiceIds);
          existingChoiceIds.add(choiceId);
          return {
            id: choiceId,
            groupId: id,
            name: choice.name.trim(),
            priceDeltaPhp: choice.priceDeltaPhp ?? 0,
            available: choice.available ?? true,
            isDefault: choice.isDefault ?? false,
            sortOrder: choice.sortOrder ?? idx + 1,
            version: 1,
          };
        });
        const created: OptionGroup = {
          id,
          name: input.name.trim(),
          description: (input.description ?? '').trim(),
          selectionMode: input.selectionMode ?? 'multi',
          required: input.required ?? false,
          minSelect: input.minSelect ?? 0,
          maxSelect: input.maxSelect ?? null,
          sortOrder: input.sortOrder ?? state.optionGroups.length + 1,
          active: input.active ?? true,
          choices,
          version: 1,
        };
        state.optionGroups.push(created);
        return jsonResponse({ data: created }, 201);
      }

      if (method === 'PATCH' && path.startsWith('/admin/option-groups/')) {
        const id = decodeURIComponent(path.slice('/admin/option-groups/'.length));
        const group = state.optionGroups.find((entry) => entry.id === id);
        if (!group) return problemJson(404, 'OPTION_GROUP_NOT_FOUND', 'Option group not found.');
        const patch = body as OptionGroupPatch;
        if (patch.expectedVersion !== undefined && group.version !== patch.expectedVersion) {
          return problemJson(409, 'CONFLICT', 'Option group was updated on another device.');
        }
        if (patch.name !== undefined) group.name = patch.name.trim();
        if (patch.description !== undefined) group.description = patch.description.trim();
        if (patch.selectionMode !== undefined) group.selectionMode = patch.selectionMode;
        if (patch.required !== undefined) group.required = patch.required;
        if (patch.minSelect !== undefined) group.minSelect = patch.minSelect;
        if (patch.maxSelect !== undefined) group.maxSelect = patch.maxSelect;
        if (patch.sortOrder !== undefined) group.sortOrder = patch.sortOrder;
        if (patch.active !== undefined) group.active = patch.active;
        if (patch.choices !== undefined) {
          const existingChoiceIds = new Set<string>(
            state.optionGroups
              .filter((entry) => entry.id !== id)
              .flatMap((entry) => entry.choices.map((choice) => choice.id)),
          );
          group.choices = patch.choices.map((choice, idx) => {
            const choiceId = choice.id ?? slugifyOptionChoiceId(choice.name, existingChoiceIds);
            existingChoiceIds.add(choiceId);
            return {
              id: choiceId,
              groupId: id,
              name: choice.name.trim(),
              priceDeltaPhp: choice.priceDeltaPhp ?? 0,
              available: choice.available ?? true,
              isDefault: choice.isDefault ?? false,
              sortOrder: choice.sortOrder ?? idx + 1,
              version: 1,
            };
          });
        }
        group.version = (group.version ?? 1) + 1;
        return jsonResponse({ data: group });
      }

      if (method === 'DELETE' && path.startsWith('/admin/option-groups/')) {
        const id = decodeURIComponent(path.slice('/admin/option-groups/'.length));
        if (!state.optionGroups.some((group) => group.id === id)) {
          return problemJson(404, 'OPTION_GROUP_NOT_FOUND', 'Option group not found.');
        }
        if (state.menu.some((item) => item.optionGroupIds.includes(id))) {
          return problemJson(
            409,
            'OPTION_GROUP_IN_USE',
            'Detach this option group from menu items before deleting it, or pause it instead.',
          );
        }
        state.optionGroups = state.optionGroups.filter((group) => group.id !== id);
        return new Response(null, { status: 204 });
      }

      if (
        method === 'PATCH' &&
        path.startsWith('/admin/option-choices/') &&
        path.endsWith('/availability')
      ) {
        const choiceId = decodeURIComponent(
          path.slice('/admin/option-choices/'.length, -'/availability'.length),
        );
        let targetChoice: OptionChoice | null = null;
        for (const group of state.optionGroups) {
          const match = group.choices.find((choice) => choice.id === choiceId);
          if (match) {
            targetChoice = match;
            break;
          }
        }
        if (!targetChoice) {
          return problemJson(404, 'OPTION_CHOICE_NOT_FOUND', 'Option choice not found.');
        }
        const payload = body as { available: boolean; expectedVersion?: number };
        if (
          payload.expectedVersion !== undefined &&
          targetChoice.version !== payload.expectedVersion
        ) {
          return problemJson(409, 'CONFLICT', 'Option choice was updated on another device.');
        }
        targetChoice.available = Boolean(payload.available);
        targetChoice.version = (targetChoice.version ?? 1) + 1;
        return jsonResponse({ data: targetChoice });
      }

      if (method === 'PATCH' && path === '/admin/store-profile') {
        const payload = body as StoreProfilePatch;
        if (
          payload.expectedVersion !== undefined &&
          state.store.version !== payload.expectedVersion
        ) {
          return problemJson(409, 'CONFLICT', 'Store profile was updated on another device.');
        }
        if (payload.originCoords === null && state.deliveryPricing.deliveryEnabled) {
          return problemJson(
            422,
            'ORIGIN_PIN_REQUIRED',
            'Pause delivery before clearing the shop location pin.',
          );
        }
        const { expectedVersion: _expectedVersion, ...updates } = payload;
        state.store = {
          ...state.store,
          ...updates,
          version: (state.store.version ?? 1) + 1,
        };
        if (updates.originCoords !== undefined) {
          state.deliveryPricing.originCoords = updates.originCoords
            ? { ...updates.originCoords }
            : null;
          state.deliveryPricing.version = state.store.version;
        }
        if (updates.deliveryEnabled !== undefined) {
          state.deliveryPricing.deliveryEnabled = updates.deliveryEnabled;
          state.deliveryPricing.version = state.store.version;
        }
        return jsonResponse({ data: state.store });
      }

      if (method === 'PATCH' && path === '/admin/store-ordering-status') {
        const payload = body as StoreOrderingStatusPatch;
        if (
          payload.expectedVersion !== undefined &&
          state.store.version !== payload.expectedVersion
        ) {
          return problemJson(409, 'CONFLICT', 'Store status was updated on another device.');
        }
        state.store = {
          ...state.store,
          acceptingOrders: payload.acceptingOrders,
          ...(payload.closedNotice !== undefined ? { closedNotice: payload.closedNotice } : {}),
          version: (state.store.version ?? 1) + 1,
        };
        state.deliveryPricing.version = state.store.version;
        return jsonResponse({ data: state.store });
      }

      if (method === 'POST' && path === '/admin/store-assets') {
        const formData = init?.body;
        if (!(formData instanceof FormData) || !(formData.get('file') instanceof File)) {
          return problemJson(400, 'IMAGE_FILE_REQUIRED', 'Attach an image file.');
        }
        const rawPurpose = String(formData.get('purpose') ?? 'logo') as StoreAssetUploadPurpose;
        const seq = state.nextImageSeq;
        state.nextImageSeq += 1;
        const uuid = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
        const folder = rawPurpose === 'payment-qr' ? 'payment-qr' : 'branding';
        const objectPath = `${folder}/${uuid}.webp`;
        const imageUrl = `/storage/v1/object/public/menu-images/${objectPath}`;
        state.uploadedImages.add(imageUrl);
        return jsonResponse(
          {
            data: {
              imageUrl,
              path: objectPath,
              purpose: rawPurpose,
              sizeBytes: 24_800,
              width: rawPurpose === 'hero' ? 1600 : 512,
              height: rawPurpose === 'hero' ? 900 : 512,
              contentType: 'image/webp',
            },
          },
          201,
        );
      }

      if (method === 'DELETE' && path === '/admin/store-assets') {
        const payload = body as { imageUrl?: string } | undefined;
        const targetUrl = payload?.imageUrl;
        const inUseByPaymentQr = Object.values(state.store.paymentMethods).some(
          (cfg) => cfg.qrImageUrl === targetUrl,
        );
        if (
          targetUrl &&
          state.store.logoUrl !== targetUrl &&
          state.store.heroImageUrl !== targetUrl &&
          !inUseByPaymentQr
        ) {
          state.uploadedImages.delete(targetUrl);
        }
        return new Response(null, { status: 204 });
      }

      if (method === 'GET' && path === '/admin/orders') {
        const queryString = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : '';
        const params = new URLSearchParams(queryString);
        const statusParam = params.get('status') ?? 'all';
        const paymentStatusParam = params.get('paymentStatus') ?? 'all';
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
              order.addressOrNotes.toLowerCase().includes(qParam) ||
              (order.tableNumber ?? '').toLowerCase().includes(qParam) ||
              (order.paymentReference ?? '').toLowerCase().includes(qParam);
            if (!matches) return false;
          }
          return true;
        });

        const paymentFiltered = baseFiltered.filter((order) => {
          if (paymentStatusParam === 'all') return true;
          return (order.paymentStatus ?? 'unpaid') === paymentStatusParam;
        });

        const counts = {
          all: paymentFiltered.length,
          active: paymentFiltered.filter(
            (order) => order.status !== 'completed' && order.status !== 'cancelled',
          ).length,
          received: paymentFiltered.filter((order) => order.status === 'received').length,
          preparing: paymentFiltered.filter((order) => order.status === 'preparing').length,
          ready: paymentFiltered.filter((order) => order.status === 'ready').length,
          completed: paymentFiltered.filter((order) => order.status === 'completed').length,
          cancelled: paymentFiltered.filter((order) => order.status === 'cancelled').length,
          pendingVerification: baseFiltered.filter(
            (order) =>
              (order.paymentStatus ?? 'unpaid') === 'pending_verification' &&
              order.status !== 'cancelled',
          ).length,
        };

        const statusFiltered = paymentFiltered.filter((order) => {
          if (statusParam === 'all') return true;
          if (statusParam === 'active') {
            return order.status !== 'completed' && order.status !== 'cancelled';
          }
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

      if (
        method === 'PATCH' &&
        path.startsWith('/admin/orders/') &&
        path.endsWith('/payment-status')
      ) {
        const orderId = path.slice('/admin/orders/'.length, -'/payment-status'.length);
        const order = state.orders.find((entry) => entry.id === orderId);
        if (!order) return problemJson(404, 'ORDER_NOT_FOUND', 'Order not found.');
        const payload = body as { paymentStatus: PaymentStatus; expectedVersion?: number };
        if (payload.expectedVersion !== undefined && order.version !== payload.expectedVersion) {
          return problemJson(
            409,
            'CONFLICT',
            'Order payment status was updated on another device.',
          );
        }
        order.paymentStatus = payload.paymentStatus;
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
        if (options.enableDemoReset === false) {
          return problemJson(
            403,
            'DEMO_RESET_DISABLED',
            'Demo catalog reset is disabled in this environment.',
          );
        }
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
        const payload = body as DeliveryPricingPatch;
        if (
          payload.expectedVersion !== undefined &&
          state.deliveryPricing.version !== payload.expectedVersion
        ) {
          return problemJson(409, 'CONFLICT', 'Delivery pricing was updated on another device.');
        }
        if (payload.deliveryEnabled === true && !state.deliveryPricing.originCoords) {
          return problemJson(
            422,
            'ORIGIN_PIN_REQUIRED',
            'Set your shop location pin in Store Settings before enabling delivery.',
          );
        }
        if (payload.deliveryEnabled !== undefined) {
          state.deliveryPricing.deliveryEnabled = payload.deliveryEnabled;
          state.store.deliveryEnabled = payload.deliveryEnabled;
        }
        if (payload.baseFeePhp !== undefined) {
          state.deliveryPricing.baseFeePhp = payload.baseFeePhp;
        }
        if (payload.perKmRatePhp !== undefined) {
          state.deliveryPricing.perKmRatePhp = payload.perKmRatePhp;
        }
        if (payload.maxDistanceKm !== undefined) {
          state.deliveryPricing.maxDistanceKm = Math.round(payload.maxDistanceKm * 10) / 10;
        }
        if (payload.freeDeliveryMinSubtotalPhp !== undefined) {
          state.deliveryPricing.freeDeliveryMinSubtotalPhp = payload.freeDeliveryMinSubtotalPhp;
        }
        state.deliveryPricing.version = (state.deliveryPricing.version ?? 1) + 1;
        return jsonResponse({ data: state.deliveryPricing });
      }

      if (method === 'POST' && path === '/admin/delivery-pricing/reset') {
        if (options.enableDemoReset === false) {
          return problemJson(
            403,
            'DEMO_RESET_DISABLED',
            'Demo delivery pricing reset is disabled in this environment.',
          );
        }
        state.deliveryPricing = {
          ...DEFAULT_DELIVERY_PRICING,
          version: (state.deliveryPricing.version ?? 1) + 1,
        };
        return jsonResponse({ data: state.deliveryPricing });
      }

      if (method === 'GET' && path === '/admin/users') {
        return jsonResponse({ data: state.team });
      }

      if (method === 'POST' && path === '/admin/users') {
        const payload = body as CreateAdminUserRequest;
        const normalizedEmail = payload.email.trim().toLowerCase();
        if (state.team.some((member) => member.email.toLowerCase() === normalizedEmail)) {
          return problemJson(
            409,
            'EMAIL_ALREADY_REGISTERED',
            'An account with this email address is already registered.',
          );
        }
        const seq = state.nextUserSeq;
        state.nextUserSeq += 1;
        const now = new Date().toISOString();
        const created: AdminTeamMember = {
          id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
          email: normalizedEmail,
          role: payload.role,
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        state.team.push(created);
        return jsonResponse({ data: created }, 201);
      }

      if (method === 'PATCH' && path.startsWith('/admin/users/')) {
        const userId = decodeURIComponent(path.slice('/admin/users/'.length));
        if (state.activeUser.id === userId) {
          return problemJson(
            400,
            'CANNOT_MODIFY_SELF',
            'You cannot change your own role or disable your own Staff Portal account.',
          );
        }
        const member = state.team.find((entry) => entry.id === userId);
        if (!member) {
          return problemJson(404, 'ADMIN_USER_NOT_FOUND', 'Team account could not be found.');
        }
        const payload = body as UpdateAdminUserRequest;
        const nextRole = payload.role ?? member.role;
        const nextActive = payload.active ?? member.active;
        if (
          member.role === 'owner' &&
          member.active &&
          (nextRole !== 'owner' || !nextActive) &&
          !state.team.some(
            (entry) => entry.id !== member.id && entry.role === 'owner' && entry.active,
          )
        ) {
          return problemJson(
            409,
            'LAST_ACTIVE_OWNER',
            'At least one active Owner account must remain enabled.',
          );
        }
        member.role = nextRole;
        member.active = nextActive;
        member.updatedAt = new Date().toISOString();
        return jsonResponse({ data: member });
      }
    }

    return problemJson(404, 'NOT_FOUND', `Unhandled mock route: ${method} ${path}`);
  });

  return { spy, state };
}

import {
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  DEFAULT_MENU_ITEMS,
  MENU_ADDONS,
  STORE_ORIGIN_COORDS,
} from './eight-burgers-seed';
import type {
  CartLineItem,
  DeliveryPricingConfig,
  DeliveryZone,
  DeliveryZoneInput,
  FulfillmentMode,
  GeoCoordinates,
  MenuAddon,
  MenuAddonId,
  MenuCategory,
  MenuItem,
  MenuItemInput,
  OrderLineSnapshot,
  OrderRecord,
  OrderStatus,
  PaymentMethod,
} from './types';

export const SHOP_STORAGE_KEY = 'eight-burgers:state:v1';
export const DEFAULT_DELIVERY_FEE_PHP = 35;
export const ROAD_DISTANCE_FACTOR = 1.3;
export const MAX_PERSISTED_ORDERS = 100;

export type ShopState = {
  menu: MenuItem[];
  cart: CartLineItem[];
  orders: OrderRecord[];
  deliveryPricing: DeliveryPricingConfig;
  isCartOpen: boolean;
  lastPlacedOrder: OrderRecord | null;
  nextQueueSeq: number;
};

export type DeliveryFeeQuote = {
  zone: DeliveryZone | null;
  baseFeePhp: number;
  feePhp: number;
  isFreeDelivery: boolean;
  amountToFreeDeliveryPhp: number | null;
  freeDeliveryMinSubtotalPhp: number | null;
  distanceKm: number | null;
  maxDeliveryDistanceKm: number | null;
  outOfRange: boolean;
  available: boolean;
};

export type ResolvedCartLine = {
  lineId: string;
  item: MenuItem;
  quantity: number;
  addons: MenuAddon[];
  addonsPricePhp: number;
  unitWithAddonsPhp: number;
  lineTotalPhp: number;
};

export type CartSummary = {
  lines: ResolvedCartLine[];
  totalItems: number;
  subtotalPhp: number;
};

const VALID_CATEGORIES = new Set<MenuCategory>([
  'classic-burgers',
  'specialty-burgers',
  'heavyweights',
  'sides-snacks',
]);

const VALID_PAYMENT_METHODS = new Set<PaymentMethod>(['cash', 'gcash', 'maya']);

const VALID_ORDER_STATUSES = new Set<OrderStatus>(['received', 'grilling', 'ready', 'completed']);

const ADDONS_BY_ID = new Map<MenuAddonId, MenuAddon>(MENU_ADDONS.map((addon) => [addon.id, addon]));

export function isSafeImageUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function formatPhp(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₱${safe.toLocaleString('en-PH')}`;
}

export function isValidCoordinates(value: unknown): value is GeoCoordinates {
  if (!value || typeof value !== 'object') return false;
  const coords = value as Partial<GeoCoordinates>;
  return (
    typeof coords.lat === 'number' &&
    typeof coords.lng === 'number' &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

export function estimateRoadDistanceKm(from: GeoCoordinates, to: GeoCoordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = earthRadiusKm * c;
  return Math.round(straightKm * ROAD_DISTANCE_FACTOR * 10) / 10;
}

export function buildGoogleMapsPinUrl(pin: GeoCoordinates): string {
  return `https://maps.google.com/?q=${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
}

export function formatOrderShareText(order: OrderRecord): string {
  const deliveryDetailsParts: string[] = [];
  if (typeof order.deliveryDistanceKm === 'number' && Number.isFinite(order.deliveryDistanceKm)) {
    deliveryDetailsParts.push(`~${order.deliveryDistanceKm.toFixed(1)} km`);
  }
  if (order.deliveryEtaMinutes) {
    deliveryDetailsParts.push(order.deliveryEtaMinutes);
  }
  const deliveryZoneSummary =
    order.fulfillment === 'delivery' && order.deliveryZoneName
      ? ` — ${order.deliveryZoneName}${deliveryDetailsParts.length > 0 ? ` (${deliveryDetailsParts.join(' · ')})` : ''}`
      : '';
  const fulfillmentLabel =
    order.fulfillment === 'kiosk-pickup' ? 'Chino Roces Pickup' : `Delivery${deliveryZoneSummary}`;
  const deliveryFeeLine =
    order.deliveryFeePhp > 0
      ? [`Delivery fee: ${formatPhp(order.deliveryFeePhp)}`]
      : order.fulfillment === 'delivery' && order.deliveryFeeWaived
        ? ['Delivery fee: Free (min. order met)']
        : [];
  const lines = [
    `8Burgers Order ${order.queueNumber}`,
    `Guest: ${order.customerName}`,
    ...(order.contactNumber ? [`Mobile: ${order.contactNumber}`] : []),
    `Fulfillment: ${fulfillmentLabel}`,
    ...(order.addressOrNotes ? [`Details: ${order.addressOrNotes}`] : []),
    ...(order.fulfillment === 'delivery' && isValidCoordinates(order.deliveryPin)
      ? [`Map Pin: ${buildGoogleMapsPinUrl(order.deliveryPin)}`]
      : []),
    `Payment: ${order.paymentMethod.toUpperCase()}`,
    '',
    'Items:',
    ...order.lines.map((line) => {
      const addons = line.addonNames.length > 0 ? ` (+ ${line.addonNames.join(', ')})` : '';
      return `- ${line.quantity}x ${line.name}${addons} — ${formatPhp(line.lineTotalPhp)}`;
    }),
    '',
    `Subtotal: ${formatPhp(order.subtotalPhp)}`,
    ...deliveryFeeLine,
    `Total Due: ${formatPhp(order.totalPhp)}`,
  ];
  return lines.join('\n');
}

export function normalizeAddonIds(addonIds?: readonly MenuAddonId[]): MenuAddonId[] {
  if (!addonIds || addonIds.length === 0) return [];
  const unique = new Set<MenuAddonId>();
  for (const id of addonIds) {
    if (ADDONS_BY_ID.has(id)) {
      unique.add(id);
    }
  }
  return [...unique].sort();
}

export function buildCartLineId(itemId: string, addonIds?: readonly MenuAddonId[]): string {
  const normalized = normalizeAddonIds(addonIds);
  if (normalized.length === 0) return itemId;
  return `${itemId}__${normalized.join('+')}`;
}

export function calculateCartDetails(
  cart: readonly CartLineItem[],
  menu: readonly MenuItem[],
): CartSummary {
  const menuMap = new Map<string, MenuItem>(menu.map((item) => [item.id, item]));
  const lines: ResolvedCartLine[] = [];
  let totalItems = 0;
  let subtotalPhp = 0;

  for (const cartLine of cart) {
    const item = menuMap.get(cartLine.itemId);
    if (!item || cartLine.quantity <= 0) continue;

    const addons: MenuAddon[] = [];
    let addonsPricePhp = 0;
    if (item.allowAddons) {
      for (const addonId of cartLine.addonIds) {
        const addon = ADDONS_BY_ID.get(addonId);
        if (addon) {
          addons.push(addon);
          addonsPricePhp += addon.pricePhp;
        }
      }
    }

    const unitWithAddonsPhp = item.pricePhp + addonsPricePhp;
    const lineTotalPhp = unitWithAddonsPhp * cartLine.quantity;
    totalItems += cartLine.quantity;
    subtotalPhp += lineTotalPhp;

    lines.push({
      lineId: cartLine.lineId,
      item,
      quantity: cartLine.quantity,
      addons,
      addonsPricePhp,
      unitWithAddonsPhp,
      lineTotalPhp,
    });
  }

  return { lines, totalItems, subtotalPhp };
}

export function slugifyMenuId(name: string, existingIds: ReadonlySet<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'menu-item';
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function sanitizeMenuItemInput(input: MenuItemInput): MenuItemInput {
  const numericPrice = Number(input.pricePhp);
  const pricePhp =
    Number.isFinite(numericPrice) && numericPrice > 0 ? Math.round(numericPrice) : 99;
  const category = VALID_CATEGORIES.has(input.category) ? input.category : 'classic-burgers';
  const trimmedImageUrl = input.imageUrl.trim();
  return {
    name: input.name.trim() || '8Burgers Special',
    category,
    pricePhp,
    pattySpec: input.pattySpec.trim() || '100g Pure Beef',
    description: input.description.trim() || 'Freshly prepared on the Chino Roces griddle.',
    imageUrl: isSafeImageUrl(trimmedImageUrl) ? trimmedImageUrl : '',
    available: Boolean(input.available),
    featured: Boolean(input.featured),
    allowAddons: Boolean(input.allowAddons),
  };
}

export function createDefaultDeliveryPricing(): DeliveryPricingConfig {
  return {
    zones: DEFAULT_DELIVERY_ZONES.map((zone) => ({ ...zone })),
    freeDeliveryMinSubtotalPhp: DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  };
}

export function normalizeFreeDeliveryThreshold(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

export function slugifyZoneId(name: string, existingIds: ReadonlySet<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'delivery-zone';
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function sanitizeDeliveryZoneInput(input: DeliveryZoneInput): DeliveryZoneInput {
  const numericFee = Number(input.feePhp);
  const feePhp =
    Number.isFinite(numericFee) && numericFee >= 0
      ? Math.round(numericFee)
      : DEFAULT_DELIVERY_FEE_PHP;
  const numericRadius = Number(input.maxDistanceKm);
  const maxDistanceKm =
    Number.isFinite(numericRadius) && numericRadius > 0 ? Math.round(numericRadius * 10) / 10 : 5;
  return {
    name: input.name.trim() || 'Metro Manila Delivery Zone',
    areas: input.areas.trim() || 'Metro Manila',
    maxDistanceKm,
    feePhp,
    etaMinutes: input.etaMinutes.trim() || '20–35 min',
    enabled: Boolean(input.enabled),
  };
}

export function calculateDeliveryQuote(params: {
  fulfillment: FulfillmentMode;
  subtotalPhp: number;
  deliveryPricing: DeliveryPricingConfig;
  zoneId?: string | null;
  pin?: GeoCoordinates | null;
}): DeliveryFeeQuote {
  const threshold = normalizeFreeDeliveryThreshold(
    params.deliveryPricing.freeDeliveryMinSubtotalPhp,
  );
  const safeSubtotal = Number.isFinite(params.subtotalPhp) ? Math.max(0, params.subtotalPhp) : 0;

  if (params.fulfillment !== 'delivery') {
    return {
      zone: null,
      baseFeePhp: 0,
      feePhp: 0,
      isFreeDelivery: false,
      amountToFreeDeliveryPhp: null,
      freeDeliveryMinSubtotalPhp: threshold,
      distanceKm: null,
      maxDeliveryDistanceKm: null,
      outOfRange: false,
      available: true,
    };
  }

  const enabledZones = [...params.deliveryPricing.zones]
    .filter((zone) => zone.enabled)
    .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
  const maxDeliveryDistanceKm = enabledZones[enabledZones.length - 1]?.maxDistanceKm ?? null;

  if (enabledZones.length === 0) {
    return {
      zone: null,
      baseFeePhp: 0,
      feePhp: 0,
      isFreeDelivery: false,
      amountToFreeDeliveryPhp: null,
      freeDeliveryMinSubtotalPhp: threshold,
      distanceKm: null,
      maxDeliveryDistanceKm: null,
      outOfRange: false,
      available: false,
    };
  }

  const distanceKm = isValidCoordinates(params.pin)
    ? estimateRoadDistanceKm(STORE_ORIGIN_COORDS, params.pin)
    : null;

  let selectedZone: DeliveryZone | null = null;
  if (distanceKm !== null) {
    selectedZone = enabledZones.find((zone) => distanceKm <= zone.maxDistanceKm) ?? null;
    if (!selectedZone) {
      return {
        zone: null,
        baseFeePhp: 0,
        feePhp: 0,
        isFreeDelivery: false,
        amountToFreeDeliveryPhp: null,
        freeDeliveryMinSubtotalPhp: threshold,
        distanceKm,
        maxDeliveryDistanceKm,
        outOfRange: true,
        available: false,
      };
    }
  } else {
    selectedZone =
      (params.zoneId ? enabledZones.find((zone) => zone.id === params.zoneId) : undefined) ??
      enabledZones[0] ??
      null;
  }

  if (!selectedZone) {
    return {
      zone: null,
      baseFeePhp: 0,
      feePhp: 0,
      isFreeDelivery: false,
      amountToFreeDeliveryPhp: null,
      freeDeliveryMinSubtotalPhp: threshold,
      distanceKm,
      maxDeliveryDistanceKm,
      outOfRange: false,
      available: false,
    };
  }

  const baseFeePhp = Math.max(0, Math.round(selectedZone.feePhp));
  const isFreeDelivery = threshold !== null && safeSubtotal >= threshold && baseFeePhp > 0;
  const feePhp = isFreeDelivery ? 0 : baseFeePhp;
  const amountToFreeDeliveryPhp =
    threshold !== null && safeSubtotal < threshold ? threshold - safeSubtotal : null;

  return {
    zone: selectedZone,
    baseFeePhp,
    feePhp,
    isFreeDelivery,
    amountToFreeDeliveryPhp,
    freeDeliveryMinSubtotalPhp: threshold,
    distanceKm,
    maxDeliveryDistanceKm,
    outOfRange: false,
    available: true,
  };
}

export function createInitialShopState(): ShopState {
  return {
    menu: DEFAULT_MENU_ITEMS.map((item) => ({ ...item })),
    cart: [],
    orders: [],
    deliveryPricing: createDefaultDeliveryPricing(),
    isCartOpen: false,
    lastPlacedOrder: null,
    nextQueueSeq: 101,
  };
}

export type PersistedShopPayload = {
  menu: MenuItem[];
  cart: CartLineItem[];
  orders: OrderRecord[];
  deliveryPricing: DeliveryPricingConfig;
  nextQueueSeq: number;
};

function sanitizeMenuItems(value: unknown): MenuItem[] | null {
  if (!Array.isArray(value)) return null;
  const sanitized: MenuItem[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null;
    const candidate = entry as Partial<MenuItem>;
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      typeof candidate.name !== 'string' ||
      typeof candidate.pricePhp !== 'number' ||
      !Number.isFinite(candidate.pricePhp) ||
      candidate.pricePhp <= 0 ||
      !candidate.category ||
      !VALID_CATEGORIES.has(candidate.category)
    ) {
      return null;
    }
    const rawImageUrl = typeof candidate.imageUrl === 'string' ? candidate.imageUrl.trim() : '';
    sanitized.push({
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      pricePhp: Math.round(candidate.pricePhp),
      pattySpec: typeof candidate.pattySpec === 'string' ? candidate.pattySpec : '100g Pure Beef',
      description: typeof candidate.description === 'string' ? candidate.description : '',
      imageUrl: isSafeImageUrl(rawImageUrl) ? rawImageUrl : '',
      available: Boolean(candidate.available),
      featured: Boolean(candidate.featured),
      allowAddons: Boolean(candidate.allowAddons),
    });
  }
  return sanitized;
}

function sanitizeOrderLineSnapshot(entry: unknown): OrderLineSnapshot | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const line = entry as Partial<OrderLineSnapshot>;
  if (
    typeof line.lineId !== 'string' ||
    typeof line.itemId !== 'string' ||
    typeof line.name !== 'string' ||
    typeof line.unitPricePhp !== 'number' ||
    !Number.isFinite(line.unitPricePhp) ||
    typeof line.addonsPricePhp !== 'number' ||
    !Number.isFinite(line.addonsPricePhp) ||
    typeof line.quantity !== 'number' ||
    !Number.isFinite(line.quantity) ||
    line.quantity <= 0 ||
    typeof line.lineTotalPhp !== 'number' ||
    !Number.isFinite(line.lineTotalPhp)
  ) {
    return null;
  }
  const addonNames = Array.isArray(line.addonNames)
    ? line.addonNames.filter((name): name is string => typeof name === 'string')
    : [];
  return {
    lineId: line.lineId,
    itemId: line.itemId,
    name: line.name,
    unitPricePhp: Math.round(line.unitPricePhp),
    addonNames,
    addonsPricePhp: Math.round(line.addonsPricePhp),
    quantity: Math.round(line.quantity),
    lineTotalPhp: Math.round(line.lineTotalPhp),
  };
}

function sanitizeOrderRecord(entry: unknown): OrderRecord | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const raw = entry as Partial<OrderRecord> & { fulfillment?: unknown };
  const rawFulfillment = raw.fulfillment;
  const fulfillment: FulfillmentMode | null =
    rawFulfillment === 'kiosk-pickup'
      ? 'kiosk-pickup'
      : rawFulfillment === 'delivery' || rawFulfillment === 'makati-delivery'
        ? 'delivery'
        : null;

  if (
    !fulfillment ||
    typeof raw.id !== 'string' ||
    raw.id.trim().length === 0 ||
    typeof raw.queueNumber !== 'string' ||
    typeof raw.customerName !== 'string' ||
    typeof raw.subtotalPhp !== 'number' ||
    !Number.isFinite(raw.subtotalPhp) ||
    typeof raw.deliveryFeePhp !== 'number' ||
    !Number.isFinite(raw.deliveryFeePhp) ||
    typeof raw.totalPhp !== 'number' ||
    !Number.isFinite(raw.totalPhp) ||
    !raw.paymentMethod ||
    !VALID_PAYMENT_METHODS.has(raw.paymentMethod) ||
    !raw.status ||
    !VALID_ORDER_STATUSES.has(raw.status) ||
    !Array.isArray(raw.lines)
  ) {
    return null;
  }

  const lines = raw.lines
    .map(sanitizeOrderLineSnapshot)
    .filter((line): line is OrderLineSnapshot => line !== null);

  return {
    id: raw.id,
    queueNumber: raw.queueNumber,
    customerName: raw.customerName,
    contactNumber: typeof raw.contactNumber === 'string' ? raw.contactNumber : '',
    fulfillment,
    ...(typeof raw.deliveryZoneId === 'string' && raw.deliveryZoneId
      ? { deliveryZoneId: raw.deliveryZoneId }
      : {}),
    ...(typeof raw.deliveryZoneName === 'string' && raw.deliveryZoneName
      ? { deliveryZoneName: raw.deliveryZoneName }
      : {}),
    ...(typeof raw.deliveryEtaMinutes === 'string' && raw.deliveryEtaMinutes
      ? { deliveryEtaMinutes: raw.deliveryEtaMinutes }
      : {}),
    ...(fulfillment === 'delivery' && isValidCoordinates(raw.deliveryPin)
      ? { deliveryPin: { lat: raw.deliveryPin.lat, lng: raw.deliveryPin.lng } }
      : {}),
    ...(typeof raw.deliveryDistanceKm === 'number' &&
    Number.isFinite(raw.deliveryDistanceKm) &&
    raw.deliveryDistanceKm >= 0
      ? { deliveryDistanceKm: raw.deliveryDistanceKm }
      : {}),
    ...(raw.deliveryFeeWaived === true ? { deliveryFeeWaived: true } : {}),
    addressOrNotes: typeof raw.addressOrNotes === 'string' ? raw.addressOrNotes : '',
    paymentMethod: raw.paymentMethod,
    lines,
    subtotalPhp: Math.max(0, Math.round(raw.subtotalPhp)),
    deliveryFeePhp: Math.max(0, Math.round(raw.deliveryFeePhp)),
    totalPhp: Math.max(0, Math.round(raw.totalPhp)),
    status: raw.status,
    createdAtIso: typeof raw.createdAtIso === 'string' ? raw.createdAtIso : '',
  };
}

const DEFAULT_ZONE_RADIUS_BY_ID = new Map<string, number>(
  DEFAULT_DELIVERY_ZONES.map((zone) => [zone.id, zone.maxDistanceKm]),
);

const FALLBACK_ZONE_RADII_KM = [2.5, 5, 10, 16, 25];

function isDeliveryZoneEntry(entry: unknown): entry is Partial<DeliveryZone> & {
  id: string;
  name: string;
  feePhp: number;
  etaMinutes: string;
  enabled: boolean;
} {
  if (typeof entry !== 'object' || entry === null) return false;
  const candidate = entry as Partial<DeliveryZone>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.feePhp === 'number' &&
    Number.isFinite(candidate.feePhp) &&
    candidate.feePhp >= 0 &&
    typeof candidate.etaMinutes === 'string' &&
    typeof candidate.enabled === 'boolean'
  );
}

export function sanitizeDeliveryPricingConfig(raw: unknown): DeliveryPricingConfig {
  const fallback = createDefaultDeliveryPricing();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const parsed = raw as Partial<DeliveryPricingConfig>;
  const validZones = Array.isArray(parsed.zones)
    ? parsed.zones.filter(isDeliveryZoneEntry).map((zone, index) => {
        const trimmedId = zone.id.trim();
        const rawRadius = zone.maxDistanceKm;
        const maxDistanceKm =
          typeof rawRadius === 'number' && Number.isFinite(rawRadius) && rawRadius > 0
            ? Math.round(rawRadius * 10) / 10
            : (DEFAULT_ZONE_RADIUS_BY_ID.get(trimmedId) ??
              FALLBACK_ZONE_RADII_KM[index] ??
              (index + 1) * 5);
        return {
          id: trimmedId,
          name: zone.name.trim(),
          areas: typeof zone.areas === 'string' ? zone.areas.trim() : '',
          maxDistanceKm,
          feePhp: Math.round(zone.feePhp),
          etaMinutes: zone.etaMinutes.trim() || '20–35 min',
          enabled: zone.enabled,
        };
      })
    : [];

  const zones = validZones.length > 0 ? validZones : fallback.zones;
  const hasThresholdKey = Object.prototype.hasOwnProperty.call(
    parsed,
    'freeDeliveryMinSubtotalPhp',
  );
  const freeDeliveryMinSubtotalPhp = hasThresholdKey
    ? normalizeFreeDeliveryThreshold(parsed.freeDeliveryMinSubtotalPhp)
    : fallback.freeDeliveryMinSubtotalPhp;

  return {
    zones,
    freeDeliveryMinSubtotalPhp,
  };
}

export function sanitizePersistedShopPayload(raw: unknown): PersistedShopPayload {
  const fallback = createInitialShopState();
  if (!raw || typeof raw !== 'object') {
    return {
      menu: fallback.menu,
      cart: fallback.cart,
      orders: fallback.orders,
      deliveryPricing: fallback.deliveryPricing,
      nextQueueSeq: fallback.nextQueueSeq,
    };
  }

  const parsed = raw as Partial<PersistedShopPayload>;
  const menu = sanitizeMenuItems(parsed.menu) ?? fallback.menu;
  const cart = Array.isArray(parsed.cart)
    ? parsed.cart.filter(
        (line): line is CartLineItem =>
          typeof line === 'object' &&
          line !== null &&
          typeof line.lineId === 'string' &&
          typeof line.itemId === 'string' &&
          typeof line.quantity === 'number' &&
          line.quantity > 0 &&
          Array.isArray(line.addonIds),
      )
    : fallback.cart;
  const orders = Array.isArray(parsed.orders)
    ? parsed.orders
        .map(sanitizeOrderRecord)
        .filter((order): order is OrderRecord => order !== null)
        .slice(0, MAX_PERSISTED_ORDERS)
    : fallback.orders;
  const deliveryPricing = sanitizeDeliveryPricingConfig(parsed.deliveryPricing);
  const nextQueueSeq =
    typeof parsed.nextQueueSeq === 'number' && parsed.nextQueueSeq >= 101
      ? Math.round(parsed.nextQueueSeq)
      : fallback.nextQueueSeq;

  return { menu, cart, orders, deliveryPricing, nextQueueSeq };
}

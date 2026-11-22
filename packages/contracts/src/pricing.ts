import {
  DEFAULT_DELIVERY_FEE_PHP,
  DEFAULT_DELIVERY_ZONES,
  DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  ROAD_DISTANCE_FACTOR,
  STORE_ORIGIN_COORDS,
  type DeliveryPricingConfig,
  type DeliveryZone,
  type DeliveryZoneInput,
  type GeoCoordinates,
} from './delivery.schema';
import {
  MENU_ADDONS,
  MENU_CATEGORY_VALUES,
  isSafeImageUrl,
  type MenuAddon,
  type MenuAddonId,
  type MenuCategory,
  type MenuItem,
  type MenuItemInput,
} from './menu.schema';
import type { CartLineItem, FulfillmentMode, OrderRecord } from './order.schema';

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
  unavailableLineIds: string[];
  removedLineIds: string[];
  totalItems: number;
  subtotalPhp: number;
};

const VALID_CATEGORIES = new Set<MenuCategory>(MENU_CATEGORY_VALUES);
const ADDONS_BY_ID = new Map<MenuAddonId, MenuAddon>(MENU_ADDONS.map((addon) => [addon.id, addon]));

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
  addonsCatalog: readonly MenuAddon[] = MENU_ADDONS,
): CartSummary {
  const menuMap = new Map<string, MenuItem>(menu.map((item) => [item.id, item]));
  const addonMap = new Map<MenuAddonId, MenuAddon>(addonsCatalog.map((addon) => [addon.id, addon]));
  const lines: ResolvedCartLine[] = [];
  const unavailableLineIds: string[] = [];
  const removedLineIds: string[] = [];
  let totalItems = 0;
  let subtotalPhp = 0;

  for (const cartLine of cart) {
    if (cartLine.quantity <= 0) {
      continue;
    }

    const item = menuMap.get(cartLine.itemId);
    if (!item) {
      removedLineIds.push(cartLine.lineId);
      continue;
    }

    if (!item.available) {
      unavailableLineIds.push(cartLine.lineId);
    }

    const addons: MenuAddon[] = [];
    let addonsPricePhp = 0;
    if (item.allowAddons) {
      for (const addonId of normalizeAddonIds(cartLine.addonIds)) {
        const addon = addonMap.get(addonId);
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

  return { lines, unavailableLineIds, removedLineIds, totalItems, subtotalPhp };
}

function slugifyWithMaxLength(
  name: string,
  fallback: string,
  existingIds: ReadonlySet<string>,
  maxLength = 120,
): string {
  const rawBase =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback;
  const base = rawBase.slice(0, maxLength).replace(/-+$/, '') || fallback;
  if (!existingIds.has(base)) return base;
  let suffix = 2;
  while (true) {
    const suffixText = `-${suffix}`;
    const trimmedBase = base
      .slice(0, Math.max(1, maxLength - suffixText.length))
      .replace(/-+$/, '');
    const candidate = `${trimmedBase || fallback.slice(0, maxLength - suffixText.length)}${suffixText}`;
    if (!existingIds.has(candidate)) return candidate;
    suffix += 1;
  }
}

export function slugifyMenuId(name: string, existingIds: ReadonlySet<string>): string {
  return slugifyWithMaxLength(name, 'menu-item', existingIds);
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
  return slugifyWithMaxLength(name, 'delivery-zone', existingIds);
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
  storeOrigin?: GeoCoordinates;
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

  const origin = params.storeOrigin ?? STORE_ORIGIN_COORDS;
  const distanceKm = isValidCoordinates(params.pin)
    ? estimateRoadDistanceKm(origin, params.pin)
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
  } else if (params.zoneId) {
    selectedZone = enabledZones.find((zone) => zone.id === params.zoneId) ?? null;
  } else {
    selectedZone = enabledZones[0] ?? null;
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

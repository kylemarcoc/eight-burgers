import { DEFAULT_MENU_ITEMS, MENU_ADDONS } from './eight-burgers-seed';
import type {
  CartLineItem,
  MenuAddon,
  MenuAddonId,
  MenuCategory,
  MenuItem,
  MenuItemInput,
  OrderRecord,
} from './types';

export const SHOP_STORAGE_KEY = 'eight-burgers:state:v1';
export const MAKATI_DELIVERY_FEE_PHP = 35;

export type ShopState = {
  menu: MenuItem[];
  cart: CartLineItem[];
  orders: OrderRecord[];
  isCartOpen: boolean;
  lastPlacedOrder: OrderRecord | null;
  nextQueueSeq: number;
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

const ADDONS_BY_ID = new Map<MenuAddonId, MenuAddon>(MENU_ADDONS.map((addon) => [addon.id, addon]));

export function formatPhp(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₱${safe.toLocaleString('en-PH')}`;
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
  return {
    name: input.name.trim() || '8Burgers Special',
    category,
    pricePhp,
    pattySpec: input.pattySpec.trim() || '100g Pure Beef',
    description: input.description.trim() || 'Freshly prepared on the Chino Roces griddle.',
    imageUrl: input.imageUrl.trim(),
    available: Boolean(input.available),
    featured: Boolean(input.featured),
    allowAddons: Boolean(input.allowAddons),
  };
}

export function createInitialShopState(): ShopState {
  return {
    menu: DEFAULT_MENU_ITEMS.map((item) => ({ ...item })),
    cart: [],
    orders: [],
    isCartOpen: false,
    lastPlacedOrder: null,
    nextQueueSeq: 101,
  };
}

export type PersistedShopPayload = {
  menu: MenuItem[];
  cart: CartLineItem[];
  orders: OrderRecord[];
  nextQueueSeq: number;
};

function isMenuItemArray(value: unknown): value is MenuItem[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as MenuItem).id === 'string' &&
      typeof (entry as MenuItem).name === 'string' &&
      typeof (entry as MenuItem).pricePhp === 'number' &&
      VALID_CATEGORIES.has((entry as MenuItem).category),
  );
}

export function sanitizePersistedShopPayload(raw: unknown): PersistedShopPayload {
  const fallback = createInitialShopState();
  if (!raw || typeof raw !== 'object') {
    return {
      menu: fallback.menu,
      cart: fallback.cart,
      orders: fallback.orders,
      nextQueueSeq: fallback.nextQueueSeq,
    };
  }

  const parsed = raw as Partial<PersistedShopPayload>;
  const menu = isMenuItemArray(parsed.menu) ? parsed.menu : fallback.menu;
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
  const orders = Array.isArray(parsed.orders) ? (parsed.orders as OrderRecord[]) : fallback.orders;
  const nextQueueSeq =
    typeof parsed.nextQueueSeq === 'number' && parsed.nextQueueSeq >= 101
      ? Math.round(parsed.nextQueueSeq)
      : fallback.nextQueueSeq;

  return { menu, cart, orders, nextQueueSeq };
}

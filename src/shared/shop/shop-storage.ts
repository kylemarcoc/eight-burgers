import { DEFAULT_MENU_ITEMS, MENU_ADDONS } from './eight-burgers-seed';
import type {
  CartLineItem,
  MenuAddon,
  MenuAddonId,
  MenuCategory,
  MenuItem,
  MenuItemInput,
  OrderCustomerInput,
  OrderLineSnapshot,
  OrderRecord,
  OrderStatus,
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

export type ShopAction =
  | { type: 'add_to_cart'; itemId: string; quantity?: number; addonIds?: MenuAddonId[] }
  | { type: 'set_line_quantity'; lineId: string; quantity: number }
  | { type: 'remove_cart_line'; lineId: string }
  | { type: 'clear_cart' }
  | { type: 'set_cart_open'; open: boolean }
  | { type: 'create_menu_item'; input: MenuItemInput }
  | { type: 'update_menu_item'; id: string; input: MenuItemInput }
  | { type: 'toggle_item_availability'; id: string }
  | { type: 'delete_menu_item'; id: string }
  | { type: 'reset_catalog' }
  | { type: 'place_order'; customer: OrderCustomerInput }
  | { type: 'update_order_status'; orderId: string; status: OrderStatus }
  | { type: 'dismiss_last_order' };

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

function slugifyId(name: string, existingIds: ReadonlySet<string>): string {
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

function sanitizeMenuItemInput(input: MenuItemInput): MenuItemInput {
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

export function shopReducer(state: ShopState, action: ShopAction): ShopState {
  switch (action.type) {
    case 'add_to_cart': {
      const targetItem = state.menu.find((item) => item.id === action.itemId);
      if (!targetItem || !targetItem.available) return state;

      const qtyToAdd = Math.max(1, Math.round(action.quantity ?? 1));
      const addonIds = targetItem.allowAddons ? normalizeAddonIds(action.addonIds) : [];
      const lineId = buildCartLineId(targetItem.id, addonIds);
      const existing = state.cart.find((line) => line.lineId === lineId);

      const nextCart = existing
        ? state.cart.map((line) =>
            line.lineId === lineId ? { ...line, quantity: line.quantity + qtyToAdd } : line,
          )
        : [...state.cart, { lineId, itemId: targetItem.id, quantity: qtyToAdd, addonIds }];

      return {
        ...state,
        cart: nextCart,
        lastPlacedOrder: null,
      };
    }

    case 'set_line_quantity': {
      const nextQty = Math.round(action.quantity);
      if (nextQty <= 0) {
        return {
          ...state,
          cart: state.cart.filter((line) => line.lineId !== action.lineId),
        };
      }
      return {
        ...state,
        cart: state.cart.map((line) =>
          line.lineId === action.lineId ? { ...line, quantity: nextQty } : line,
        ),
      };
    }

    case 'remove_cart_line':
      return {
        ...state,
        cart: state.cart.filter((line) => line.lineId !== action.lineId),
      };

    case 'clear_cart':
      return {
        ...state,
        cart: [],
      };

    case 'set_cart_open':
      return {
        ...state,
        isCartOpen: action.open,
      };

    case 'create_menu_item': {
      const existingIds = new Set(state.menu.map((item) => item.id));
      const clean = sanitizeMenuItemInput(action.input);
      const newItem: MenuItem = {
        id: slugifyId(clean.name, existingIds),
        ...clean,
      };
      return {
        ...state,
        menu: [newItem, ...state.menu],
      };
    }

    case 'update_menu_item': {
      const clean = sanitizeMenuItemInput(action.input);
      return {
        ...state,
        menu: state.menu.map((item) => (item.id === action.id ? { id: item.id, ...clean } : item)),
        cart: clean.available ? state.cart : state.cart.filter((line) => line.itemId !== action.id),
      };
    }

    case 'toggle_item_availability': {
      let becameUnavailable = false;
      const nextMenu = state.menu.map((item) => {
        if (item.id !== action.id) return item;
        const nextAvailable = !item.available;
        if (!nextAvailable) becameUnavailable = true;
        return { ...item, available: nextAvailable };
      });
      return {
        ...state,
        menu: nextMenu,
        cart: becameUnavailable
          ? state.cart.filter((line) => line.itemId !== action.id)
          : state.cart,
      };
    }

    case 'delete_menu_item':
      return {
        ...state,
        menu: state.menu.filter((item) => item.id !== action.id),
        cart: state.cart.filter((line) => line.itemId !== action.id),
      };

    case 'reset_catalog': {
      const defaultItems = DEFAULT_MENU_ITEMS.map((item) => ({ ...item }));
      const validIds = new Set(defaultItems.map((item) => item.id));
      return {
        ...state,
        menu: defaultItems,
        cart: state.cart.filter((line) => validIds.has(line.itemId)),
      };
    }

    case 'place_order': {
      const summary = calculateCartDetails(state.cart, state.menu);
      if (summary.lines.length === 0) return state;

      const deliveryFeePhp =
        action.customer.fulfillment === 'makati-delivery' ? MAKATI_DELIVERY_FEE_PHP : 0;
      const lines: OrderLineSnapshot[] = summary.lines.map((line) => ({
        lineId: line.lineId,
        itemId: line.item.id,
        name: line.item.name,
        unitPricePhp: line.item.pricePhp,
        addonNames: line.addons.map((addon) => addon.name),
        addonsPricePhp: line.addonsPricePhp,
        quantity: line.quantity,
        lineTotalPhp: line.lineTotalPhp,
      }));

      const seq = state.nextQueueSeq;
      const newOrder: OrderRecord = {
        id: `ord-${seq}-${Date.now().toString(36)}`,
        queueNumber: `#8B-${seq}`,
        customerName: action.customer.customerName.trim() || 'Walk-in Guest',
        contactNumber: action.customer.contactNumber.trim(),
        fulfillment: action.customer.fulfillment,
        addressOrNotes: action.customer.addressOrNotes.trim(),
        paymentMethod: action.customer.paymentMethod,
        lines,
        subtotalPhp: summary.subtotalPhp,
        deliveryFeePhp,
        totalPhp: summary.subtotalPhp + deliveryFeePhp,
        status: 'received',
        createdAtIso: new Date().toISOString(),
      };

      return {
        ...state,
        cart: [],
        orders: [newOrder, ...state.orders],
        lastPlacedOrder: newOrder,
        nextQueueSeq: seq + 1,
      };
    }

    case 'update_order_status':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.orderId ? { ...order, status: action.status } : order,
        ),
        lastPlacedOrder:
          state.lastPlacedOrder && state.lastPlacedOrder.id === action.orderId
            ? { ...state.lastPlacedOrder, status: action.status }
            : state.lastPlacedOrder,
      };

    case 'dismiss_last_order':
      return {
        ...state,
        lastPlacedOrder: null,
      };
  }
}

type PersistedShopPayload = {
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

export function loadPersistedShopState(): ShopState {
  const initial = createInitialShopState();
  if (typeof window === 'undefined') return initial;

  try {
    const raw = window.localStorage.getItem(SHOP_STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<PersistedShopPayload>;
    if (!parsed || typeof parsed !== 'object') return initial;

    const menu = isMenuItemArray(parsed.menu) ? parsed.menu : initial.menu;
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
      : initial.cart;
    const orders = Array.isArray(parsed.orders) ? (parsed.orders as OrderRecord[]) : initial.orders;
    const nextQueueSeq =
      typeof parsed.nextQueueSeq === 'number' && parsed.nextQueueSeq >= 101
        ? Math.round(parsed.nextQueueSeq)
        : initial.nextQueueSeq;

    return {
      ...initial,
      menu,
      cart,
      orders,
      nextQueueSeq,
    };
  } catch {
    return initial;
  }
}

export function persistShopState(state: ShopState): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedShopPayload = {
      menu: state.menu,
      cart: state.cart,
      orders: state.orders,
      nextQueueSeq: state.nextQueueSeq,
    };
    window.localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode errors and keep in-memory state.
  }
}

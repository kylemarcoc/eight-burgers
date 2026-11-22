import {
  buildCartLineId,
  normalizeAddonIds,
  type CartLineItem,
  type MenuAddonId,
  type MenuItem,
  type OrderRecord,
} from '@eight-burgers/contracts';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export const CART_STORAGE_KEY = 'eight-burgers:cart:v2';
export const LEGACY_SHOP_STORAGE_KEY = 'eight-burgers:state:v1';

export type PlacedOrderReceipt = {
  order: OrderRecord;
  receiptToken: string;
};

type PersistedCartPayload = {
  cart: CartLineItem[];
};

export type CartActions = {
  setCartOpen: (open: boolean) => void;
  addToCart: (
    item: Pick<MenuItem, 'id' | 'available' | 'allowAddons'>,
    options?: { quantity?: number; addonIds?: MenuAddonId[] },
  ) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeCartLine: (lineId: string) => void;
  clearCart: () => void;
  setLastPlacedOrder: (receipt: PlacedOrderReceipt | null) => void;
  dismissLastOrder: () => void;
  reset: () => void;
};

export type CartStoreState = {
  cart: CartLineItem[];
  isCartOpen: boolean;
  lastPlacedOrder: PlacedOrderReceipt | null;
  actions: CartActions;
};

function sanitizeCartLines(raw: unknown): CartLineItem[] {
  if (!Array.isArray(raw)) return [];
  const valid: CartLineItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Partial<CartLineItem>;
    if (
      typeof candidate.itemId !== 'string' ||
      candidate.itemId.trim().length === 0 ||
      typeof candidate.quantity !== 'number' ||
      !Number.isFinite(candidate.quantity) ||
      candidate.quantity <= 0
    ) {
      continue;
    }
    const addonIds = Array.isArray(candidate.addonIds)
      ? normalizeAddonIds(candidate.addonIds as MenuAddonId[])
      : [];
    const itemId = candidate.itemId.trim();
    const lineId = buildCartLineId(itemId, addonIds);
    const quantity = Math.min(50, Math.max(1, Math.round(candidate.quantity)));
    valid.push({ lineId, itemId, quantity, addonIds });
  }
  return valid;
}

function migrateLegacyCartIfPresent(): PersistedCartPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_SHOP_STORAGE_KEY);
    if (!legacyRaw) return null;

    let migratedCart: CartLineItem[] = [];
    try {
      const parsed = JSON.parse(legacyRaw) as Partial<StorageValue<{ cart?: unknown }>> & {
        cart?: unknown;
      };
      const payload =
        parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed;
      migratedCart = sanitizeCartLines(payload?.cart);
    } catch {
      migratedCart = [];
    }

    // Always purge legacy storage key so guest PII (names/phones/addresses) is removed immediately.
    window.localStorage.removeItem(LEGACY_SHOP_STORAGE_KEY);
    return { cart: migratedCart };
  } catch {
    return null;
  }
}

let suppressNextPersist = false;

const cartPersistStorage: PersistStorage<PersistedCartPayload> = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(name);
      if (raw) {
        // Ensure legacy key is purged even if cart:v2 already exists.
        try {
          window.localStorage.removeItem(LEGACY_SHOP_STORAGE_KEY);
        } catch {
          // Ignore restricted storage removal errors.
        }
        const parsed = JSON.parse(raw) as Partial<StorageValue<{ cart?: unknown }>> & {
          cart?: unknown;
        };
        const payload =
          parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed;
        return {
          state: { cart: sanitizeCartLines(payload?.cart) },
          version: 2,
        };
      }

      const migrated = migrateLegacyCartIfPresent();
      if (migrated) {
        try {
          window.localStorage.setItem(name, JSON.stringify({ state: migrated, version: 2 }));
        } catch {
          // Keep migrated cart in memory if storage quota is blocked.
        }
        return { state: migrated, version: 2 };
      }

      return null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (suppressNextPersist) {
      suppressNextPersist = false;
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Ignore QuotaExceededError / private browsing errors and retain in-memory cart.
    }
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  },
};

export const useCartStore = create<CartStoreState>()(
  persist(
    immer((set) => ({
      cart: [],
      isCartOpen: false,
      lastPlacedOrder: null,
      actions: {
        setCartOpen: (open) =>
          set((draft) => {
            draft.isCartOpen = open;
          }),

        addToCart: (item, options) =>
          set((draft) => {
            if (!item.available) return;
            const qtyToAdd = Math.max(1, Math.round(options?.quantity ?? 1));
            const addonIds = item.allowAddons ? normalizeAddonIds(options?.addonIds) : [];
            const lineId = buildCartLineId(item.id, addonIds);
            const existing = draft.cart.find((line) => line.lineId === lineId);

            if (existing) {
              existing.quantity = Math.min(50, existing.quantity + qtyToAdd);
            } else {
              draft.cart.push({
                lineId,
                itemId: item.id,
                quantity: Math.min(50, qtyToAdd),
                addonIds,
              });
            }

            draft.lastPlacedOrder = null;
          }),

        setLineQuantity: (lineId, quantity) =>
          set((draft) => {
            const idx = draft.cart.findIndex((line) => line.lineId === lineId);
            if (idx === -1) return;

            const nextQty = Math.round(quantity);
            if (nextQty <= 0) {
              draft.cart.splice(idx, 1);
              return;
            }

            const line = draft.cart[idx];
            if (!line) return;
            line.quantity = Math.min(50, nextQty);
          }),

        removeCartLine: (lineId) =>
          set((draft) => {
            const idx = draft.cart.findIndex((line) => line.lineId === lineId);
            if (idx === -1) return;
            draft.cart.splice(idx, 1);
          }),

        clearCart: () =>
          set((draft) => {
            draft.cart = [];
          }),

        setLastPlacedOrder: (receipt) =>
          set((draft) => {
            draft.lastPlacedOrder = receipt;
          }),

        dismissLastOrder: () =>
          set((draft) => {
            draft.lastPlacedOrder = null;
          }),

        reset: () => {
          suppressNextPersist = true;
          try {
            set((draft) => {
              draft.cart = [];
              draft.isCartOpen = false;
              draft.lastPlacedOrder = null;
            });
          } finally {
            suppressNextPersist = false;
          }
        },
      },
    })),
    {
      name: CART_STORAGE_KEY,
      version: 2,
      storage: cartPersistStorage,
      partialize: (state): PersistedCartPayload => ({ cart: state.cart }),
      merge: (persistedState, currentState): CartStoreState => {
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState;
        }
        const candidate = persistedState as Partial<PersistedCartPayload>;
        return {
          ...currentState,
          cart: sanitizeCartLines(candidate.cart),
        };
      },
    },
  ),
);

export function resetCartStore(): void {
  useCartStore.getState().actions.reset();
}

export const useCartLines = (): readonly CartLineItem[] => useCartStore((state) => state.cart);
export const useCartOpen = (): boolean => useCartStore((state) => state.isCartOpen);
export const useLastPlacedOrder = (): PlacedOrderReceipt | null =>
  useCartStore((state) => state.lastPlacedOrder);
export const useCartActions = (): CartActions => useCartStore((state) => state.actions);

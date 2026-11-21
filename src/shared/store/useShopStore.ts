import type { Draft } from 'immer';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import {
  MAKATI_DELIVERY_FEE_PHP,
  SHOP_STORAGE_KEY,
  buildCartLineId,
  calculateCartDetails,
  createInitialShopState,
  normalizeAddonIds,
  sanitizeMenuItemInput,
  sanitizePersistedShopPayload,
  slugifyMenuId,
  type CartSummary,
  type PersistedShopPayload,
  type ShopState,
} from '@/shared/shop/shop-storage';
import type {
  MenuAddonId,
  MenuItem,
  MenuItemInput,
  OrderCustomerInput,
  OrderLineSnapshot,
  OrderRecord,
  OrderStatus,
} from '@/shared/shop/types';

export type ShopActions = {
  setCartOpen: (open: boolean) => void;
  addToCart: (itemId: string, options?: { quantity?: number; addonIds?: MenuAddonId[] }) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeCartLine: (lineId: string) => void;
  clearCart: () => void;
  createMenuItem: (input: MenuItemInput) => void;
  updateMenuItem: (id: string, input: MenuItemInput) => void;
  toggleItemAvailability: (id: string) => void;
  deleteMenuItem: (id: string) => void;
  resetCatalog: () => void;
  placeOrder: (customer: OrderCustomerInput) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  dismissLastOrder: () => void;
  reset: () => void;
};

export type ShopStoreState = ShopState & {
  cartSummary: CartSummary;
  actions: ShopActions;
};

type ShopStoreData = ShopState & { cartSummary: CartSummary };

function createDefaultStoreData(): ShopStoreData {
  const initial = createInitialShopState();
  return {
    ...initial,
    cartSummary: calculateCartDetails(initial.cart, initial.menu),
  };
}

function pickPersistedPayload(
  state: Pick<ShopState, keyof PersistedShopPayload>,
): PersistedShopPayload {
  return {
    menu: state.menu,
    cart: state.cart,
    orders: state.orders,
    nextQueueSeq: state.nextQueueSeq,
  };
}

function arePersistedSlicesEqual(a: PersistedShopPayload, b: PersistedShopPayload): boolean {
  return (
    a.menu === b.menu &&
    a.cart === b.cart &&
    a.orders === b.orders &&
    a.nextQueueSeq === b.nextQueueSeq
  );
}

let lastPersistedSnapshot: PersistedShopPayload | null = null;
let suppressNextPersist = false;

const shopPersistStorage: PersistStorage<PersistedShopPayload> = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(name);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<StorageValue<unknown>> | Record<string, unknown>;
      const rawPayload =
        parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed;
      const version =
        parsed && typeof parsed === 'object' && typeof parsed.version === 'number'
          ? parsed.version
          : 1;
      const payload = sanitizePersistedShopPayload(rawPayload);
      lastPersistedSnapshot = payload;
      return { state: payload, version };
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (suppressNextPersist) {
      suppressNextPersist = false;
      return;
    }
    if (lastPersistedSnapshot && arePersistedSlicesEqual(value.state, lastPersistedSnapshot)) {
      return;
    }
    lastPersistedSnapshot = value.state;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Ignore storage quota or private-mode errors and keep in-memory state.
    }
  },
  removeItem: (name) => {
    lastPersistedSnapshot = null;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  },
};

function syncCartSummary(draft: Draft<ShopStoreState>): void {
  draft.cartSummary = calculateCartDetails(draft.cart, draft.menu);
}

export const useShopStore = create<ShopStoreState>()(
  persist(
    immer((set) => {
      const initialData = createDefaultStoreData();
      lastPersistedSnapshot = pickPersistedPayload(initialData);

      return {
        ...initialData,
        actions: {
          setCartOpen: (open) =>
            set((draft) => {
              draft.isCartOpen = open;
            }),

          addToCart: (itemId, options) =>
            set((draft) => {
              const targetItem = draft.menu.find((item) => item.id === itemId);
              if (!targetItem || !targetItem.available) return;

              const qtyToAdd = Math.max(1, Math.round(options?.quantity ?? 1));
              const addonIds = targetItem.allowAddons ? normalizeAddonIds(options?.addonIds) : [];
              const lineId = buildCartLineId(targetItem.id, addonIds);
              const existing = draft.cart.find((line) => line.lineId === lineId);

              if (existing) {
                existing.quantity += qtyToAdd;
              } else {
                draft.cart.push({ lineId, itemId: targetItem.id, quantity: qtyToAdd, addonIds });
              }

              draft.lastPlacedOrder = null;
              syncCartSummary(draft);
            }),

          setLineQuantity: (lineId, quantity) =>
            set((draft) => {
              const idx = draft.cart.findIndex((line) => line.lineId === lineId);
              if (idx === -1) return;

              const nextQty = Math.round(quantity);
              if (nextQty <= 0) {
                draft.cart.splice(idx, 1);
                syncCartSummary(draft);
                return;
              }

              const line = draft.cart[idx];
              if (!line || line.quantity === nextQty) return;
              line.quantity = nextQty;
              syncCartSummary(draft);
            }),

          removeCartLine: (lineId) =>
            set((draft) => {
              const idx = draft.cart.findIndex((line) => line.lineId === lineId);
              if (idx === -1) return;
              draft.cart.splice(idx, 1);
              syncCartSummary(draft);
            }),

          clearCart: () =>
            set((draft) => {
              if (draft.cart.length === 0) return;
              draft.cart = [];
              syncCartSummary(draft);
            }),

          createMenuItem: (input) =>
            set((draft) => {
              const existingIds = new Set(draft.menu.map((item) => item.id));
              const clean = sanitizeMenuItemInput(input);
              draft.menu.unshift({
                id: slugifyMenuId(clean.name, existingIds),
                ...clean,
              });
              syncCartSummary(draft);
            }),

          updateMenuItem: (id, input) =>
            set((draft) => {
              const clean = sanitizeMenuItemInput(input);
              const idx = draft.menu.findIndex((item) => item.id === id);
              if (idx !== -1) {
                draft.menu[idx] = { id, ...clean };
              }
              if (!clean.available) {
                draft.cart = draft.cart.filter((line) => line.itemId !== id);
              }
              syncCartSummary(draft);
            }),

          toggleItemAvailability: (id) =>
            set((draft) => {
              const target = draft.menu.find((item) => item.id === id);
              if (!target) return;

              target.available = !target.available;
              if (!target.available) {
                draft.cart = draft.cart.filter((line) => line.itemId !== id);
              }
              syncCartSummary(draft);
            }),

          deleteMenuItem: (id) =>
            set((draft) => {
              draft.menu = draft.menu.filter((item) => item.id !== id);
              draft.cart = draft.cart.filter((line) => line.itemId !== id);
              syncCartSummary(draft);
            }),

          resetCatalog: () =>
            set((draft) => {
              const defaultItems = createInitialShopState().menu;
              const validIds = new Set(defaultItems.map((item) => item.id));
              draft.menu = defaultItems;
              draft.cart = draft.cart.filter((line) => validIds.has(line.itemId));
              syncCartSummary(draft);
            }),

          placeOrder: (customer) =>
            set((draft) => {
              const summary = calculateCartDetails(draft.cart, draft.menu);
              if (summary.lines.length === 0) return;

              const deliveryFeePhp =
                customer.fulfillment === 'makati-delivery' ? MAKATI_DELIVERY_FEE_PHP : 0;
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

              const seq = draft.nextQueueSeq;
              const newOrder: OrderRecord = {
                id: `ord-${seq}-${Date.now().toString(36)}`,
                queueNumber: `#8B-${seq}`,
                customerName: customer.customerName.trim() || 'Walk-in Guest',
                contactNumber: customer.contactNumber.trim(),
                fulfillment: customer.fulfillment,
                addressOrNotes: customer.addressOrNotes.trim(),
                paymentMethod: customer.paymentMethod,
                lines,
                subtotalPhp: summary.subtotalPhp,
                deliveryFeePhp,
                totalPhp: summary.subtotalPhp + deliveryFeePhp,
                status: 'received',
                createdAtIso: new Date().toISOString(),
              };

              draft.cart = [];
              draft.orders.unshift(newOrder);
              draft.lastPlacedOrder = newOrder;
              draft.nextQueueSeq = seq + 1;
              syncCartSummary(draft);
            }),

          updateOrderStatus: (orderId, status) =>
            set((draft) => {
              const order = draft.orders.find((entry) => entry.id === orderId);
              if (order) {
                order.status = status;
              }
              if (draft.lastPlacedOrder && draft.lastPlacedOrder.id === orderId) {
                draft.lastPlacedOrder.status = status;
              }
            }),

          dismissLastOrder: () =>
            set((draft) => {
              draft.lastPlacedOrder = null;
            }),

          reset: () => {
            const nextData = createDefaultStoreData();
            lastPersistedSnapshot = pickPersistedPayload(nextData);
            suppressNextPersist = true;
            try {
              set(() => nextData);
            } finally {
              suppressNextPersist = false;
            }
          },
        },
      };
    }),
    {
      name: SHOP_STORAGE_KEY,
      version: 1,
      storage: shopPersistStorage,
      partialize: pickPersistedPayload,
      merge: (persistedState, currentState): ShopStoreState => {
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState;
        }
        const payload = sanitizePersistedShopPayload(persistedState);
        return {
          ...currentState,
          ...payload,
          cartSummary: calculateCartDetails(payload.cart, payload.menu),
        };
      },
    },
  ),
);

export function resetShopStore(): void {
  useShopStore.getState().actions.reset();
}

export const useShopMenu = (): readonly MenuItem[] => useShopStore((state) => state.menu);

export const useShopCartSummary = (): CartSummary => useShopStore((state) => state.cartSummary);

export const useShopCartOpen = (): boolean => useShopStore((state) => state.isCartOpen);

export const useShopLastPlacedOrder = (): OrderRecord | null =>
  useShopStore((state) => state.lastPlacedOrder);

export const useShopOrders = (): readonly OrderRecord[] => useShopStore((state) => state.orders);

export const useShopActions = (): ShopActions => useShopStore((state) => state.actions);

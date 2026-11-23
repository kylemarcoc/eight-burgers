import {
  TABLE_NUMBER_MAX_LENGTH,
  buildCartLineId,
  normalizeItemNote,
  normalizeQueueNumber,
  normalizeSelectedOptionIds,
  type CartLineItem,
  type MenuItem,
  type OrderRecord,
} from '@menu-kiosk/contracts';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export const CART_STORAGE_KEY = 'menu-kiosk:cart:v3';
export const LEGACY_CART_V2_STORAGE_KEY = 'eight-burgers:cart:v2';
export const LEGACY_SHOP_STORAGE_KEY = 'eight-burgers:state:v1';
export const DINE_IN_TABLE_STORAGE_KEY = 'menu-kiosk:dine-in-table';
export const RECEIPT_SESSION_STORAGE_KEY = 'menu-kiosk:receipt-session';

export type PlacedOrderReceipt = {
  order: OrderRecord;
  receiptToken: string;
};

export type OpaqueReceiptSession = {
  orderId: string;
  queueNumber: string;
  receiptToken: string;
};

type PersistedCartPayload = {
  cart: CartLineItem[];
  trackedQueueNumber?: string | null;
};

export type CartActions = {
  setCartOpen: (open: boolean) => void;
  addToCart: (
    item: Pick<MenuItem, 'id' | 'available'>,
    options?: { quantity?: number; selectedOptionIds?: readonly string[]; itemNote?: string },
  ) => void;
  updateCartLine: (
    oldLineId: string,
    next: { selectedOptionIds: readonly string[]; itemNote?: string; quantity?: number },
  ) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeCartLine: (lineId: string) => void;
  clearCart: () => void;
  setLastPlacedOrder: (receipt: PlacedOrderReceipt | null) => void;
  setTrackedQueueNumber: (queueNumber: string | null) => void;
  setDineInTable: (table: string | null) => void;
  clearDineInTable: () => void;
  clearReceiptSession: () => void;
  clearPersistedReceiptSession: () => void;
  rehydrateSessionStorage: () => void;
  dismissLastOrder: () => void;
  reset: () => void;
};

export type CartStoreState = {
  cart: CartLineItem[];
  isCartOpen: boolean;
  lastPlacedOrder: PlacedOrderReceipt | null;
  receiptSession: OpaqueReceiptSession | null;
  trackedQueueNumber: string | null;
  dineInTable: string | null;
  actions: CartActions;
};

function sanitizeTrackedQueueNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 20) return null;
  if (/^#?\d+$/.test(trimmed)) {
    return trimmed.replace(/^#/, '');
  }
  const normalized = normalizeQueueNumber(trimmed);
  if (!normalized || normalized.length > 20) return null;
  return normalized;
}

export function sanitizeDineInTable(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.slice(0, TABLE_NUMBER_MAX_LENGTH);
}

function readSessionDineInTable(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sanitizeDineInTable(window.sessionStorage.getItem(DINE_IN_TABLE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeSessionDineInTable(table: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (table) {
      window.sessionStorage.setItem(DINE_IN_TABLE_STORAGE_KEY, table);
    } else {
      window.sessionStorage.removeItem(DINE_IN_TABLE_STORAGE_KEY);
    }
  } catch {
    // Ignore restricted sessionStorage environments.
  }
}

function sanitizeReceiptSession(raw: unknown): OpaqueReceiptSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<OpaqueReceiptSession>;
  const orderId = typeof candidate.orderId === 'string' ? candidate.orderId.trim() : '';
  const queueNumber = sanitizeTrackedQueueNumber(candidate.queueNumber);
  const receiptToken =
    typeof candidate.receiptToken === 'string' ? candidate.receiptToken.trim() : '';
  if (
    !orderId ||
    orderId.length > 64 ||
    !queueNumber ||
    !receiptToken ||
    receiptToken.length > 256
  ) {
    return null;
  }
  return { orderId, queueNumber, receiptToken };
}

function readSessionReceipt(): OpaqueReceiptSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(RECEIPT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeReceiptSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeSessionReceipt(session: OpaqueReceiptSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (session) {
      // Strictly store only opaque receipt identifiers (zero guest PII).
      window.sessionStorage.setItem(
        RECEIPT_SESSION_STORAGE_KEY,
        JSON.stringify({
          orderId: session.orderId,
          queueNumber: session.queueNumber,
          receiptToken: session.receiptToken,
        }),
      );
    } else {
      window.sessionStorage.removeItem(RECEIPT_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore restricted sessionStorage environments.
  }
}

function sanitizeCartLines(raw: unknown): CartLineItem[] {
  if (!Array.isArray(raw)) return [];
  const validByLineId = new Map<string, CartLineItem>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Partial<CartLineItem> & { addonIds?: unknown };
    if (
      typeof candidate.itemId !== 'string' ||
      candidate.itemId.trim().length === 0 ||
      typeof candidate.quantity !== 'number' ||
      !Number.isFinite(candidate.quantity) ||
      candidate.quantity <= 0
    ) {
      continue;
    }
    const rawOptions = Array.isArray(candidate.selectedOptionIds)
      ? candidate.selectedOptionIds
      : Array.isArray(candidate.addonIds)
        ? candidate.addonIds
        : [];
    const selectedOptionIds = normalizeSelectedOptionIds(
      rawOptions.filter((id): id is string => typeof id === 'string'),
    );
    const itemNote = normalizeItemNote(
      typeof candidate.itemNote === 'string' ? candidate.itemNote : '',
    );
    const itemId = candidate.itemId.trim();
    const lineId = buildCartLineId(itemId, selectedOptionIds, itemNote);
    const quantity = Math.min(50, Math.max(1, Math.round(candidate.quantity)));
    const existing = validByLineId.get(lineId);
    if (existing) {
      existing.quantity = Math.min(50, existing.quantity + quantity);
    } else {
      validByLineId.set(lineId, { lineId, itemId, quantity, selectedOptionIds, itemNote });
    }
  }
  return [...validByLineId.values()];
}

function purgeLegacyCartStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_CART_V2_STORAGE_KEY);
  } catch {
    // Ignore restricted storage removal errors.
  }
  try {
    window.localStorage.removeItem(LEGACY_SHOP_STORAGE_KEY);
  } catch {
    // Ignore restricted storage removal errors.
  }
}

function migrateLegacyCartIfPresent(): PersistedCartPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const legacyV2Raw = window.localStorage.getItem(LEGACY_CART_V2_STORAGE_KEY);
    if (legacyV2Raw) {
      let migratedCart: CartLineItem[] = [];
      let migratedTrackedQueue: string | null = null;
      try {
        const parsed = JSON.parse(legacyV2Raw) as Partial<
          StorageValue<{ cart?: unknown; trackedQueueNumber?: unknown }>
        > & {
          cart?: unknown;
          trackedQueueNumber?: unknown;
        };
        const payload =
          parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed;
        migratedCart = sanitizeCartLines(payload?.cart);
        migratedTrackedQueue = sanitizeTrackedQueueNumber(payload?.trackedQueueNumber);
      } catch {
        migratedCart = [];
        migratedTrackedQueue = null;
      }

      purgeLegacyCartStorage();
      return { cart: migratedCart, trackedQueueNumber: migratedTrackedQueue };
    }

    const legacyV1Raw = window.localStorage.getItem(LEGACY_SHOP_STORAGE_KEY);
    if (!legacyV1Raw) return null;

    let migratedCart: CartLineItem[] = [];
    try {
      const parsed = JSON.parse(legacyV1Raw) as Partial<StorageValue<{ cart?: unknown }>> & {
        cart?: unknown;
      };
      const payload =
        parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed;
      migratedCart = sanitizeCartLines(payload?.cart);
    } catch {
      migratedCart = [];
    }

    // Always purge legacy storage keys so guest PII (names/phones/addresses) is removed immediately.
    purgeLegacyCartStorage();
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
        // Ensure legacy keys are purged even if menu-kiosk:cart:v3 already exists.
        purgeLegacyCartStorage();
        const parsed = JSON.parse(raw) as Partial<
          StorageValue<{ cart?: unknown; trackedQueueNumber?: unknown }>
        > & {
          cart?: unknown;
          trackedQueueNumber?: unknown;
        };
        const payload =
          parsed && typeof parsed === 'object' && 'state' in parsed ? parsed.state : parsed;
        return {
          state: {
            cart: sanitizeCartLines(payload?.cart),
            trackedQueueNumber: sanitizeTrackedQueueNumber(payload?.trackedQueueNumber),
          },
          version: 3,
        };
      }

      const migrated = migrateLegacyCartIfPresent();
      if (migrated) {
        try {
          window.localStorage.setItem(name, JSON.stringify({ state: migrated, version: 3 }));
        } catch {
          // Keep migrated cart in memory if storage quota is blocked.
        }
        return { state: migrated, version: 3 };
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
      receiptSession: readSessionReceipt(),
      trackedQueueNumber: null,
      dineInTable: readSessionDineInTable(),
      actions: {
        setCartOpen: (open) =>
          set((draft) => {
            draft.isCartOpen = open;
          }),

        addToCart: (item, options) =>
          set((draft) => {
            if (!item.available) return;
            const qtyToAdd = Math.max(1, Math.round(options?.quantity ?? 1));
            const selectedOptionIds = normalizeSelectedOptionIds(options?.selectedOptionIds);
            const itemNote = normalizeItemNote(options?.itemNote);
            const lineId = buildCartLineId(item.id, selectedOptionIds, itemNote);
            const existing = draft.cart.find((line) => line.lineId === lineId);

            if (existing) {
              existing.quantity = Math.min(50, existing.quantity + qtyToAdd);
            } else {
              draft.cart.push({
                lineId,
                itemId: item.id,
                quantity: Math.min(50, qtyToAdd),
                selectedOptionIds,
                itemNote,
              });
            }
          }),

        updateCartLine: (oldLineId, next) =>
          set((draft) => {
            const idx = draft.cart.findIndex((line) => line.lineId === oldLineId);
            if (idx === -1) return;
            const existing = draft.cart[idx];
            if (!existing) return;

            const selectedOptionIds = normalizeSelectedOptionIds(next.selectedOptionIds);
            const itemNote = normalizeItemNote(
              next.itemNote !== undefined ? next.itemNote : existing.itemNote,
            );
            const nextQty =
              next.quantity !== undefined
                ? Math.min(50, Math.max(1, Math.round(next.quantity)))
                : existing.quantity;
            const nextLineId = buildCartLineId(existing.itemId, selectedOptionIds, itemNote);

            if (nextLineId === oldLineId) {
              existing.selectedOptionIds = selectedOptionIds;
              existing.itemNote = itemNote;
              existing.quantity = nextQty;
              return;
            }

            const duplicateIdx = draft.cart.findIndex((line) => line.lineId === nextLineId);
            if (duplicateIdx !== -1) {
              const duplicate = draft.cart[duplicateIdx];
              if (duplicate) {
                duplicate.quantity = Math.min(50, duplicate.quantity + nextQty);
              }
              draft.cart.splice(idx, 1);
              return;
            }

            draft.cart[idx] = {
              lineId: nextLineId,
              itemId: existing.itemId,
              quantity: nextQty,
              selectedOptionIds,
              itemNote,
            };
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
            if (receipt) {
              const normalizedQueue = sanitizeTrackedQueueNumber(receipt.order.queueNumber);
              draft.trackedQueueNumber = normalizedQueue;
              const isTerminal =
                receipt.order.status === 'completed' || receipt.order.status === 'cancelled';
              if (isTerminal || !normalizedQueue) {
                draft.receiptSession = null;
                writeSessionReceipt(null);
              } else {
                const nextSession: OpaqueReceiptSession = {
                  orderId: receipt.order.id,
                  queueNumber: receipt.order.queueNumber,
                  receiptToken: receipt.receiptToken,
                };
                draft.receiptSession = nextSession;
                writeSessionReceipt(nextSession);
              }
            } else {
              draft.receiptSession = null;
              writeSessionReceipt(null);
            }
          }),

        setTrackedQueueNumber: (queueNumber) =>
          set((draft) => {
            const normalized = sanitizeTrackedQueueNumber(queueNumber);
            draft.trackedQueueNumber = normalized;
            if (
              draft.lastPlacedOrder &&
              sanitizeTrackedQueueNumber(draft.lastPlacedOrder.order.queueNumber) !== normalized
            ) {
              draft.lastPlacedOrder = null;
            }
            if (
              draft.receiptSession &&
              sanitizeTrackedQueueNumber(draft.receiptSession.queueNumber) !== normalized
            ) {
              draft.receiptSession = null;
              writeSessionReceipt(null);
            }
          }),

        setDineInTable: (table) =>
          set((draft) => {
            const sanitized = sanitizeDineInTable(table);
            draft.dineInTable = sanitized;
            writeSessionDineInTable(sanitized);
          }),

        clearDineInTable: () =>
          set((draft) => {
            draft.dineInTable = null;
            writeSessionDineInTable(null);
          }),

        clearReceiptSession: () =>
          set((draft) => {
            draft.receiptSession = null;
            draft.lastPlacedOrder = null;
            writeSessionReceipt(null);
          }),

        clearPersistedReceiptSession: () => {
          writeSessionReceipt(null);
        },

        rehydrateSessionStorage: () =>
          set((draft) => {
            draft.dineInTable = readSessionDineInTable();
            draft.receiptSession = readSessionReceipt();
          }),

        dismissLastOrder: () =>
          set((draft) => {
            draft.lastPlacedOrder = null;
            draft.receiptSession = null;
            draft.trackedQueueNumber = null;
            writeSessionReceipt(null);
          }),

        reset: () => {
          suppressNextPersist = true;
          try {
            set((draft) => {
              draft.cart = [];
              draft.isCartOpen = false;
              draft.lastPlacedOrder = null;
              draft.receiptSession = null;
              draft.trackedQueueNumber = null;
              draft.dineInTable = null;
            });
          } finally {
            suppressNextPersist = false;
          }
        },
      },
    })),
    {
      name: CART_STORAGE_KEY,
      version: 3,
      storage: cartPersistStorage,
      partialize: (state): PersistedCartPayload => ({
        cart: state.cart,
        trackedQueueNumber: state.trackedQueueNumber,
      }),
      merge: (persistedState, currentState): CartStoreState => {
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState;
        }
        const candidate = persistedState as Partial<PersistedCartPayload>;
        return {
          ...currentState,
          cart: sanitizeCartLines(candidate.cart),
          trackedQueueNumber: sanitizeTrackedQueueNumber(candidate.trackedQueueNumber),
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
export const useReceiptSession = (): OpaqueReceiptSession | null =>
  useCartStore((state) => state.receiptSession);
export const useTrackedQueueNumber = (): string | null =>
  useCartStore((state) => state.trackedQueueNumber);
export const useDineInTable = (): string | null => useCartStore((state) => state.dineInTable);
export const useCartActions = (): CartActions => useCartStore((state) => state.actions);

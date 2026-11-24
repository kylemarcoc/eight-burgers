import { buildCartLineId } from '@menu-kiosk/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CART_STORAGE_KEY,
  DINE_IN_TABLE_STORAGE_KEY,
  LEGACY_CART_V2_STORAGE_KEY,
  LEGACY_SHOP_STORAGE_KEY,
  RECEIPT_SESSION_STORAGE_KEY,
  resetCartStore,
  useCartStore,
} from './useCartStore';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCartStore();
});

describe('useCartStore', () => {
  it('migrates legacy v1 cart addonIds to selectedOptionIds and purges guest PII', async () => {
    window.localStorage.setItem(
      LEGACY_SHOP_STORAGE_KEY,
      JSON.stringify({
        state: {
          cart: [
            {
              lineId: 'burger-deluxe__bacon',
              itemId: 'burger-deluxe',
              quantity: 2,
              addonIds: ['bacon'],
            },
          ],
          orders: [
            {
              id: 'ord-101',
              customerName: 'Sensitive Guest',
              contactNumber: '09171234567',
              addressOrNotes: 'Unit 402 Chino Roces',
            },
          ],
        },
        version: 1,
      }),
    );

    await useCartStore.persist.rehydrate();

    expect(window.localStorage.getItem(LEGACY_SHOP_STORAGE_KEY)).toBeNull();
    const persisted = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(persisted).toBeTruthy();
    expect(persisted).not.toContain('Sensitive Guest');
    expect(persisted).not.toContain('09171234567');
    expect(useCartStore.getState().cart).toEqual([
      {
        lineId: 'burger-deluxe__bacon',
        itemId: 'burger-deluxe',
        quantity: 2,
        selectedOptionIds: ['bacon'],
        itemNote: '',
      },
    ]);
  });

  it('migrates legacy eight-burgers:cart:v2 to menu-kiosk:cart:v3 preserving selectedOptionIds, itemNote, and trackedQueueNumber while purging legacy keys', async () => {
    window.localStorage.setItem(
      LEGACY_CART_V2_STORAGE_KEY,
      JSON.stringify({
        state: {
          cart: [
            {
              lineId: 'iced-latte__milk-oat_size-large__note:less-ice',
              itemId: 'iced-latte',
              quantity: 2,
              selectedOptionIds: ['size-large', 'milk-oat'],
              itemNote: 'Less ice',
            },
          ],
          trackedQueueNumber: '#KK-108',
        },
        version: 2,
      }),
    );
    window.localStorage.setItem(LEGACY_SHOP_STORAGE_KEY, JSON.stringify({ state: { cart: [] } }));

    await useCartStore.persist.rehydrate();

    expect(window.localStorage.getItem(LEGACY_CART_V2_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_SHOP_STORAGE_KEY)).toBeNull();
    const persistedV3 = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(persistedV3).toBeTruthy();
    expect(persistedV3).toContain('iced-latte');
    expect(persistedV3).toContain('Less ice');
    expect(persistedV3).toContain('#KK-108');
    expect(useCartStore.getState().cart).toEqual([
      {
        lineId: buildCartLineId('iced-latte', ['milk-oat', 'size-large'], 'Less ice'),
        itemId: 'iced-latte',
        quantity: 2,
        selectedOptionIds: ['milk-oat', 'size-large'],
        itemNote: 'Less ice',
      },
    ]);
    expect(useCartStore.getState().trackedQueueNumber).toBe('#KK-108');
  });

  it('deduplicates lines by options + itemNote and updates/merges lines via updateCartLine', () => {
    const actions = useCartStore.getState().actions;

    actions.addToCart(
      { id: 'iced-latte', available: true },
      { quantity: 1, selectedOptionIds: ['size-large', 'milk-oat'], itemNote: 'Less ice' },
    );
    actions.addToCart(
      { id: 'iced-latte', available: true },
      { quantity: 1, selectedOptionIds: ['milk-oat', 'size-large'], itemNote: 'No ice' },
    );

    expect(useCartStore.getState().cart).toHaveLength(2);
    const firstLine = useCartStore.getState().cart[0];
    const secondLine = useCartStore.getState().cart[1];
    expect(firstLine?.itemNote).toBe('Less ice');
    expect(secondLine?.itemNote).toBe('No ice');

    // Updating second line to match first line merges quantities
    if (secondLine) {
      actions.updateCartLine(secondLine.lineId, {
        selectedOptionIds: ['milk-oat', 'size-large'],
        itemNote: 'Less ice',
      });
    }
    expect(useCartStore.getState().cart).toHaveLength(1);
    expect(useCartStore.getState().cart[0]?.quantity).toBe(2);
  });

  it('persists only opaque receipt session + dine-in table in sessionStorage with zero PII and clears on dismiss or terminal status', () => {
    const actions = useCartStore.getState().actions;
    actions.setDineInTable('  Table  7  ');
    expect(window.sessionStorage.getItem(DINE_IN_TABLE_STORAGE_KEY)).toBe('Table 7');

    actions.addToCart(
      { id: 'burger-deluxe', available: true },
      { quantity: 1, selectedOptionIds: ['sliced-cheese'], itemNote: 'No onions' },
    );
    actions.setLastPlacedOrder({
      receiptToken: 'super-secret-receipt-token',
      order: {
        id: '00000000-0000-4000-8000-000000000101',
        queueNumber: '#8B-101',
        customerName: 'Marco Santos',
        contactNumber: '09171234567',
        fulfillment: 'pickup',
        tableNumber: '',
        addressOrNotes: 'Secret street',
        paymentMethod: 'gcash',
        paymentStatus: 'unpaid',
        paymentReference: '',
        lines: [],
        subtotalPhp: 168,
        deliveryFeePhp: 0,
        totalPhp: 168,
        status: 'received',
        createdAtIso: '2026-11-22T00:00:00.000Z',
      },
    });

    actions.addToCart({ id: 'chicano-burger', available: true });
    expect(useCartStore.getState().trackedQueueNumber).toBe('#8B-101');
    expect(useCartStore.getState().lastPlacedOrder?.order.queueNumber).toBe('#8B-101');

    // localStorage never stores receiptToken or PII
    const localPersisted = window.localStorage.getItem(CART_STORAGE_KEY) ?? '';
    expect(localPersisted).toContain('burger-deluxe');
    expect(localPersisted).toContain('No onions');
    expect(localPersisted).toContain('#8B-101');
    expect(localPersisted).not.toContain('super-secret-receipt-token');
    expect(localPersisted).not.toContain('09171234567');
    expect(localPersisted).not.toContain('Marco Santos');

    // sessionStorage stores ONLY opaque { orderId, queueNumber, receiptToken } (zero PII)
    const sessionPersisted = window.sessionStorage.getItem(RECEIPT_SESSION_STORAGE_KEY) ?? '';
    expect(JSON.parse(sessionPersisted)).toEqual({
      orderId: '00000000-0000-4000-8000-000000000101',
      queueNumber: '#8B-101',
      receiptToken: 'super-secret-receipt-token',
    });
    expect(sessionPersisted).not.toContain('Marco Santos');
    expect(sessionPersisted).not.toContain('09171234567');
    expect(sessionPersisted).not.toContain('Secret street');

    // Terminal status clears persisted receipt session automatically
    actions.setLastPlacedOrder({
      receiptToken: 'super-secret-receipt-token',
      order: {
        id: '00000000-0000-4000-8000-000000000101',
        queueNumber: '#8B-101',
        customerName: 'Marco Santos',
        contactNumber: '09171234567',
        fulfillment: 'pickup',
        tableNumber: '',
        addressOrNotes: '',
        paymentMethod: 'gcash',
        paymentStatus: 'paid',
        paymentReference: 'REF123',
        lines: [],
        subtotalPhp: 168,
        deliveryFeePhp: 0,
        totalPhp: 168,
        status: 'completed',
        createdAtIso: '2026-11-22T00:00:00.000Z',
      },
    });
    expect(window.sessionStorage.getItem(RECEIPT_SESSION_STORAGE_KEY)).toBeNull();

    // Clearing dine-in table removes sessionStorage key
    actions.clearDineInTable();
    expect(window.sessionStorage.getItem(DINE_IN_TABLE_STORAGE_KEY)).toBeNull();
  });

  it('batches stale line removals in removeCartLines with one storage write and tracks ephemeral prunedRemovedCount', () => {
    const actions = useCartStore.getState().actions;

    actions.addToCart({ id: 'burger-deluxe', available: true });
    actions.addToCart({ id: 'chicano-burger', available: true });
    actions.addToCart({ id: 'overload-burger', available: true });

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    actions.removeCartLines(['burger-deluxe', 'overload-burger', 'missing-item']);

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(useCartStore.getState().cart.map((line) => line.itemId)).toEqual(['chicano-burger']);
    expect(useCartStore.getState().prunedRemovedCount).toBe(2);

    const persistedRaw = window.localStorage.getItem(CART_STORAGE_KEY) ?? '';
    expect(persistedRaw).not.toContain('prunedRemovedCount');

    // No-op when line IDs are already gone
    setItemSpy.mockClear();
    actions.removeCartLines(['burger-deluxe']);
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(useCartStore.getState().prunedRemovedCount).toBe(2);

    actions.clearPrunedRemovedCount();
    expect(useCartStore.getState().prunedRemovedCount).toBe(0);
  });
});

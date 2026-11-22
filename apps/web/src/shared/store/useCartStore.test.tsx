import { afterEach, describe, expect, it } from 'vitest';
import {
  CART_STORAGE_KEY,
  LEGACY_SHOP_STORAGE_KEY,
  resetCartStore,
  useCartStore,
} from './useCartStore';

afterEach(() => {
  window.localStorage.clear();
  resetCartStore();
});

describe('useCartStore', () => {
  it('migrates only valid cart items from legacy v1 storage and purges guest PII', async () => {
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
        addonIds: ['bacon'],
      },
    ]);
  });

  it('persists only cart lines and never writes lastPlacedOrder or PII to localStorage', () => {
    const actions = useCartStore.getState().actions;
    actions.addToCart(
      { id: 'burger-deluxe', available: true, allowAddons: true },
      { quantity: 1, addonIds: ['sliced-cheese'] },
    );
    actions.setLastPlacedOrder({
      receiptToken: 'super-secret-receipt-token',
      order: {
        id: '00000000-0000-4000-8000-000000000101',
        queueNumber: '#8B-101',
        customerName: 'Marco',
        contactNumber: '09171234567',
        fulfillment: 'kiosk-pickup',
        addressOrNotes: '',
        paymentMethod: 'cash',
        lines: [],
        subtotalPhp: 168,
        deliveryFeePhp: 0,
        totalPhp: 168,
        status: 'received',
        createdAtIso: '2026-11-22T00:00:00.000Z',
      },
    });

    const persisted = window.localStorage.getItem(CART_STORAGE_KEY) ?? '';
    expect(persisted).toContain('burger-deluxe');
    expect(persisted).not.toContain('super-secret-receipt-token');
    expect(persisted).not.toContain('09171234567');
  });
});

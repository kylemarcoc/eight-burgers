import { describe, expect, it } from 'vitest';
import {
  buildCartLineId,
  calculateCartDetails,
  createInitialShopState,
  formatPhp,
  sanitizePersistedShopPayload,
} from './shop-storage';

describe('shop storage helpers and cart calculations', () => {
  it('builds canonical cart line IDs regardless of add-on order and calculates surcharges', () => {
    const { menu } = createInitialShopState();
    const lineIdA = buildCartLineId('burger-deluxe', ['bacon', 'sliced-cheese']);
    const lineIdB = buildCartLineId('burger-deluxe', ['sliced-cheese', 'bacon']);

    expect(lineIdA).toBe(lineIdB);

    const summary = calculateCartDetails(
      [
        {
          lineId: lineIdA,
          itemId: 'burger-deluxe',
          quantity: 2,
          addonIds: ['bacon', 'sliced-cheese'],
        },
      ],
      menu,
    );

    // Burger Deluxe (148) + Crispy Bacon (20) + Sliced Cheese (20) = 188 x 2 = 376
    expect(summary.totalItems).toBe(2);
    expect(summary.subtotalPhp).toBe(376);
    expect(formatPhp(summary.subtotalPhp)).toBe('₱376');
  });

  it('sanitizes invalid persisted payloads back to safe defaults', () => {
    const defaults = createInitialShopState();
    const sanitized = sanitizePersistedShopPayload({
      menu: [{ id: 'broken' }],
      cart: [
        { lineId: 'bad', itemId: 'burger-deluxe', quantity: 0, addonIds: [] },
        { lineId: 'good', itemId: 'burger-deluxe', quantity: 2, addonIds: [] },
      ],
      orders: 'invalid',
      nextQueueSeq: 12,
    });

    expect(sanitized.menu).toEqual(defaults.menu);
    expect(sanitized.cart).toEqual([
      { lineId: 'good', itemId: 'burger-deluxe', quantity: 2, addonIds: [] },
    ]);
    expect(sanitized.orders).toEqual([]);
    expect(sanitized.nextQueueSeq).toBe(defaults.nextQueueSeq);
  });
});

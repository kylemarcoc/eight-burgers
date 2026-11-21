import { describe, expect, it } from 'vitest';
import {
  buildCartLineId,
  calculateCartDetails,
  createInitialShopState,
  formatOrderShareText,
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

  it('formats a shareable order summary for SMS and Messenger handoff', () => {
    const text = formatOrderShareText({
      id: 'ord-101',
      queueNumber: '#8B-101',
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'makati-delivery',
      addressOrNotes: 'Eton WestEnd Tower 1',
      paymentMethod: 'gcash',
      lines: [
        {
          lineId: 'burger-deluxe__bacon',
          itemId: 'burger-deluxe',
          name: 'Burger Deluxe',
          unitPricePhp: 148,
          addonNames: ['Crispy Bacon'],
          addonsPricePhp: 20,
          quantity: 2,
          lineTotalPhp: 336,
        },
      ],
      subtotalPhp: 336,
      deliveryFeePhp: 35,
      totalPhp: 371,
      status: 'received',
      createdAtIso: '2026-11-21T10:00:00.000Z',
    });

    expect(text).toContain('8Burgers Order #8B-101');
    expect(text).toContain('Guest: Marco');
    expect(text).toContain('2x Burger Deluxe (+ Crispy Bacon) — ₱336');
    expect(text).toContain('Delivery fee: ₱35');
    expect(text).toContain('Total Due: ₱371');
  });
});

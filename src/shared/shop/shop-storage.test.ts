import { describe, expect, it } from 'vitest';
import {
  MAX_PERSISTED_ORDERS,
  buildCartLineId,
  calculateCartDetails,
  calculateDeliveryQuote,
  createDefaultDeliveryPricing,
  createInitialShopState,
  formatOrderShareText,
  formatPhp,
  isSafeImageUrl,
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
    expect(sanitized.deliveryPricing).toEqual(defaults.deliveryPricing);
    expect(sanitized.nextQueueSeq).toBe(defaults.nextQueueSeq);
  });

  it('preserves valid deliveryPricing and explicit null threshold while recovering malformed zone entries and migrating legacy fulfillment', () => {
    const sanitized = sanitizePersistedShopPayload({
      orders: [
        {
          id: 'ord-legacy',
          queueNumber: '#8B-101',
          customerName: 'Marco',
          contactNumber: '',
          fulfillment: 'makati-delivery',
          addressOrNotes: 'Ayala Ave',
          paymentMethod: 'cash',
          lines: [],
          subtotalPhp: 148,
          deliveryFeePhp: 35,
          totalPhp: 183,
          status: 'received',
          createdAtIso: '2026-11-21T10:00:00.000Z',
        },
      ],
      deliveryPricing: {
        zones: [
          {
            id: 'salcedo',
            name: 'Salcedo Village',
            areas: 'Valero, Sedeno',
            feePhp: 45,
            etaMinutes: '15–25 min',
            enabled: true,
          },
          { id: '', name: 'Broken', feePhp: -10, etaMinutes: '', enabled: true },
        ],
        freeDeliveryMinSubtotalPhp: null,
      },
    });

    expect(sanitized.orders[0]?.fulfillment).toBe('delivery');
    expect(sanitized.deliveryPricing.freeDeliveryMinSubtotalPhp).toBeNull();
    expect(sanitized.deliveryPricing.zones).toEqual([
      {
        id: 'salcedo',
        name: 'Salcedo Village',
        areas: 'Valero, Sedeno',
        maxDistanceKm: 2.5,
        feePhp: 45,
        etaMinutes: '15–25 min',
        enabled: true,
      },
    ]);
  });

  it('locks delivery zone strictly from pinned coordinates and rejects out-of-range pins', () => {
    const pricing = createDefaultDeliveryPricing();

    // Even if a caller passes the cheapest zoneId, an Alabang pin strictly resolves to the Alabang tier (₱125)
    const alabangQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 336,
      deliveryPricing: pricing,
      zoneId: 'chino-roces-san-antonio',
      pin: { lat: 14.417, lng: 121.041 },
    });
    expect(alabangQuote.available).toBe(true);
    expect(alabangQuote.outOfRange).toBe(false);
    expect(alabangQuote.zone?.id).toBe('qc-south-metro');
    expect(alabangQuote.baseFeePhp).toBe(125);
    expect(alabangQuote.feePhp).toBe(125);
    expect(alabangQuote.distanceKm).toBeGreaterThan(16);
    expect(alabangQuote.amountToFreeDeliveryPhp).toBe(164);

    // Reaching >= ₱500 waives the fee for an in-range pin
    const unlockedFree = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 500,
      deliveryPricing: pricing,
      pin: { lat: 14.417, lng: 121.041 },
    });
    expect(unlockedFree.baseFeePhp).toBe(125);
    expect(unlockedFree.feePhp).toBe(0);
    expect(unlockedFree.isFreeDelivery).toBe(true);
    expect(unlockedFree.amountToFreeDeliveryPhp).toBeNull();

    // Tagaytay pin (> 25 km max radius) is strictly rejected as out of range
    const outOfRangeQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 600,
      deliveryPricing: pricing,
      pin: { lat: 14.1153, lng: 120.9621 },
    });
    expect(outOfRangeQuote.available).toBe(false);
    expect(outOfRangeQuote.outOfRange).toBe(true);
    expect(outOfRangeQuote.zone).toBeNull();
    expect(outOfRangeQuote.maxDeliveryDistanceKm).toBe(25);

    const allPaused = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: {
        ...pricing,
        zones: pricing.zones.map((zone) => ({ ...zone, enabled: false })),
      },
    });
    expect(allPaused.available).toBe(false);
    expect(allPaused.zone).toBeNull();
    expect(allPaused.feePhp).toBe(0);

    const pickupQuote = calculateDeliveryQuote({
      fulfillment: 'kiosk-pickup',
      subtotalPhp: 200,
      deliveryPricing: pricing,
      pin: { lat: 14.1153, lng: 120.9621 },
    });
    expect(pickupQuote.available).toBe(true);
    expect(pickupQuote.outOfRange).toBe(false);
    expect(pickupQuote.zone).toBeNull();
    expect(pickupQuote.feePhp).toBe(0);
  });

  it('formats a shareable order summary for SMS and Messenger handoff', () => {
    const text = formatOrderShareText({
      id: 'ord-101',
      queueNumber: '#8B-101',
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
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

    const waivedText = formatOrderShareText({
      id: 'ord-102',
      queueNumber: '#8B-102',
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      deliveryZoneId: 'manila-ortigas-pasig',
      deliveryZoneName: 'Manila, Ortigas & Pasig',
      deliveryEtaMinutes: '40–55 min',
      deliveryPin: { lat: 14.5869, lng: 121.0614 },
      deliveryDistanceKm: 7.8,
      deliveryFeeWaived: true,
      addressOrNotes: 'Ortigas Center, Pasig',
      paymentMethod: 'gcash',
      lines: [
        {
          lineId: 'overload-burger',
          itemId: 'overload-burger',
          name: 'Overload Burger',
          unitPricePhp: 298,
          addonNames: [],
          addonsPricePhp: 0,
          quantity: 2,
          lineTotalPhp: 596,
        },
      ],
      subtotalPhp: 596,
      deliveryFeePhp: 0,
      totalPhp: 596,
      status: 'received',
      createdAtIso: '2026-11-21T10:05:00.000Z',
    });

    expect(waivedText).toContain(
      'Fulfillment: Delivery — Manila, Ortigas & Pasig (~7.8 km · 40–55 min)',
    );
    expect(waivedText).toContain('Map Pin: https://maps.google.com/?q=14.58690,121.06140');
    expect(waivedText).toContain('Delivery fee: Free (min. order met)');
    expect(waivedText).toContain('Total Due: ₱596');
  });

  it('validates image URLs strictly and sanitizes malformed persisted orders and pins', () => {
    expect(isSafeImageUrl('')).toBe(true);
    expect(isSafeImageUrl('/images/menu/burger-deluxe.webp')).toBe(true);
    expect(isSafeImageUrl('https://images.deliveryhero.io/burger.webp')).toBe(true);
    expect(isSafeImageUrl('http://insecure.example.com/burger.webp')).toBe(false);
    expect(isSafeImageUrl('https://user:pass@example.com/burger.webp')).toBe(false);
    expect(isSafeImageUrl('//evil.example.com/burger.webp')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);

    const defaults = createInitialShopState();
    const oversizedOrders = Array.from({ length: MAX_PERSISTED_ORDERS + 5 }, (_, index) => ({
      id: `ord-${index}`,
      queueNumber: `#8B-${101 + index}`,
      customerName: 'Guest',
      contactNumber: '',
      fulfillment: 'delivery',
      deliveryPin: index === 0 ? { lat: 'bad', lng: 121 } : { lat: 14.5608, lng: 121.0124 },
      addressOrNotes: 'Makati',
      paymentMethod: 'cash',
      lines: [],
      subtotalPhp: 148,
      deliveryFeePhp: 35,
      totalPhp: 183,
      status: 'received',
      createdAtIso: '2026-11-21T10:00:00.000Z',
    }));

    const sanitized = sanitizePersistedShopPayload({
      menu: [
        {
          ...defaults.menu[0],
          imageUrl: 'http://insecure.example.com/photo.jpg',
        },
      ],
      orders: [null, { id: 'broken' }, ...oversizedOrders],
    });

    expect(sanitized.menu[0]?.imageUrl).toBe('');
    expect(sanitized.orders).toHaveLength(MAX_PERSISTED_ORDERS);
    expect(sanitized.orders[0]?.deliveryPin).toBeUndefined();
    expect(sanitized.orders[1]?.deliveryPin).toEqual({ lat: 14.5608, lng: 121.0124 });
  });
});

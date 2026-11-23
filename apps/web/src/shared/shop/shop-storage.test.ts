import { DEFAULT_MENU_ITEMS } from '@eight-burgers/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildCartLineId,
  calculateCartDetails,
  calculateDeliveryQuote,
  createDefaultDeliveryPricing,
  formatOrderShareText,
  formatPhp,
  isSafeImageUrl,
} from './shop-storage';

describe('shop storage helpers and cart calculations', () => {
  it('builds canonical cart line IDs regardless of add-on order and calculates surcharges', () => {
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
      DEFAULT_MENU_ITEMS,
    );

    expect(summary.totalItems).toBe(2);
    expect(summary.subtotalPhp).toBe(376);
    expect(formatPhp(summary.subtotalPhp)).toBe('₱376');
  });

  it('calculates distance-formula delivery fees strictly from pinned coordinates and rejects out-of-range or paused states', () => {
    const pricing = createDefaultDeliveryPricing();

    const alabangQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 336,
      deliveryPricing: pricing,
      pin: { lat: 14.417, lng: 121.041 },
    });
    expect(alabangQuote.available).toBe(true);
    expect(alabangQuote.outOfRange).toBe(false);
    expect(alabangQuote.distanceKm).toBe(21.2);
    expect(alabangQuote.baseFeePhp).toBe(35);
    expect(alabangQuote.perKmRatePhp).toBe(10);
    expect(alabangQuote.distanceFeePhp).toBe(212);
    expect(alabangQuote.subtotalFeePhp).toBe(247);
    expect(alabangQuote.feePhp).toBe(247);
    expect(alabangQuote.etaMinutes).toBe('55–70 min');
    expect(alabangQuote.amountToFreeDeliveryPhp).toBe(164);

    const unlockedFree = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 500,
      deliveryPricing: pricing,
      pin: { lat: 14.417, lng: 121.041 },
    });
    expect(unlockedFree.subtotalFeePhp).toBe(247);
    expect(unlockedFree.feePhp).toBe(0);
    expect(unlockedFree.isFreeDelivery).toBe(true);
    expect(unlockedFree.amountToFreeDeliveryPhp).toBeNull();

    const outOfRangeQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 600,
      deliveryPricing: pricing,
      pin: { lat: 14.1153, lng: 120.9621 },
    });
    expect(outOfRangeQuote.available).toBe(false);
    expect(outOfRangeQuote.outOfRange).toBe(true);
    expect(outOfRangeQuote.distanceKm).toBe(64.8);
    expect(outOfRangeQuote.maxDeliveryDistanceKm).toBe(25);

    const pausedQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: { ...pricing, deliveryEnabled: false },
      pin: { lat: 14.5572, lng: 121.0236 },
    });
    expect(pausedQuote.available).toBe(false);
    expect(pausedQuote.outOfRange).toBe(false);
  });

  it('formats a shareable order summary and validates image URLs strictly', () => {
    const text = formatOrderShareText({
      id: 'ord-102',
      queueNumber: '#8B-102',
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      deliveryEtaMinutes: '30–40 min',
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

    expect(text).toContain('Fulfillment: Delivery (~7.8 km · 30–40 min)');
    expect(text).toContain('Map Pin: https://maps.google.com/?q=14.58690,121.06140');
    expect(text).toContain('Delivery fee: Free (min. order met)');

    expect(isSafeImageUrl('/images/menu/burger-deluxe.webp')).toBe(true);
    expect(isSafeImageUrl('https://images.deliveryhero.io/burger.webp')).toBe(true);
    expect(isSafeImageUrl('http://insecure.example.com/burger.webp')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
  });
});

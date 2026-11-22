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

  it('locks delivery zone strictly from pinned coordinates and rejects out-of-range pins', () => {
    const pricing = createDefaultDeliveryPricing();

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
  });

  it('formats a shareable order summary and validates image URLs strictly', () => {
    const text = formatOrderShareText({
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

    expect(text).toContain('Fulfillment: Delivery — Manila, Ortigas & Pasig (~7.8 km · 40–55 min)');
    expect(text).toContain('Map Pin: https://maps.google.com/?q=14.58690,121.06140');
    expect(text).toContain('Delivery fee: Free (min. order met)');

    expect(isSafeImageUrl('/images/menu/burger-deluxe.webp')).toBe(true);
    expect(isSafeImageUrl('https://images.deliveryhero.io/burger.webp')).toBe(true);
    expect(isSafeImageUrl('http://insecure.example.com/burger.webp')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
  });
});

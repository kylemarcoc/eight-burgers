import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_ITEMS,
  STORE_ORIGIN_COORDS,
  adminOrdersResponseSchema,
  buildCartLineId,
  calculateCartDetails,
  calculateDeliveryQuote,
  deliveryPricingPatchSchema,
  deliveryZoneEnabledPatchSchema,
  deliveryZoneInputSchema,
  estimateRoadDistanceKm,
  isSafeImageUrl,
  menuAvailabilityPatchSchema,
  menuItemInputSchema,
  normalizeAddonIds,
  placeOrderRequestSchema,
  slugifyMenuId,
  slugifyZoneId,
  updateOrderStatusRequestSchema,
} from './index';

describe('contracts schemas and pricing math', () => {
  it('rejects client-injected pricing fields on placeOrderRequestSchema', () => {
    const parsed = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
      totalPhp: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it('requires contact number and address for delivery orders', () => {
    const parsed = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '',
      fulfillment: 'delivery',
      addressOrNotes: '',
      paymentMethod: 'gcash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('contactNumber');
      expect(paths).toContain('addressOrNotes');
    }
  });

  it('rejects invalid coordinates and unsafe image URLs', () => {
    const parsed = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      deliveryPin: { lat: 95, lng: 121.02 },
      addressOrNotes: 'Makati Ave',
      paymentMethod: 'maya',
      items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
    });
    expect(parsed.success).toBe(false);
    expect(isSafeImageUrl('/images/menu/burger-deluxe.webp')).toBe(true);
    expect(isSafeImageUrl('https://cdn.example.com/burger.webp')).toBe(true);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('//evil.example.com/x.png')).toBe(false);
  });

  it('normalizes add-ons and calculates cart totals accurately', () => {
    expect(normalizeAddonIds(['veggies', 'bacon', 'bacon'])).toEqual(['bacon', 'veggies']);
    expect(buildCartLineId('burger-deluxe', ['veggies', 'bacon'])).toBe(
      'burger-deluxe__bacon+veggies',
    );

    const summary = calculateCartDetails(
      [
        {
          lineId: 'burger-deluxe__bacon+sliced-cheese',
          itemId: 'burger-deluxe',
          quantity: 2,
          addonIds: ['bacon', 'sliced-cheese'],
        },
        {
          lineId: 'crinkle-cut-fries',
          itemId: 'crinkle-cut-fries',
          quantity: 1,
          addonIds: ['bacon'], // ignored because allowAddons = false
        },
      ],
      DEFAULT_MENU_ITEMS,
    );

    expect(summary.totalItems).toBe(3);
    expect(summary.subtotalPhp).toBe((148 + 20 + 20) * 2 + 78);
    expect(summary.unavailableLineIds).toEqual([]);
  });

  it('estimates road distance and applies delivery zone tiers and free-delivery waiver', () => {
    const distMakati = estimateRoadDistanceKm(STORE_ORIGIN_COORDS, { lat: 14.5547, lng: 121.0244 });
    expect(distMakati).toBeGreaterThan(0);
    expect(distMakati).toBeLessThan(3);

    const paidQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(paidQuote.available).toBe(true);
    expect(paidQuote.zone?.id).toBe('chino-roces-san-antonio');
    expect(paidQuote.feePhp).toBe(35);
    expect(paidQuote.isFreeDelivery).toBe(false);
    expect(paidQuote.amountToFreeDeliveryPhp).toBe(200);

    const freeQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 500,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(freeQuote.isFreeDelivery).toBe(true);
    expect(freeQuote.feePhp).toBe(0);

    const outOfRange = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 500,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.1, lng: 121.5 },
    });
    expect(outOfRange.outOfRange).toBe(true);
    expect(outOfRange.available).toBe(false);
  });

  it('validates positive integer expectedVersion on all admin mutation schemas', () => {
    for (const expectedVersion of [1, 42, undefined]) {
      const versionField = expectedVersion !== undefined ? { expectedVersion } : {};
      expect(
        updateOrderStatusRequestSchema.safeParse({ status: 'grilling', ...versionField }).success,
      ).toBe(true);
      expect(
        menuAvailabilityPatchSchema.safeParse({ available: false, ...versionField }).success,
      ).toBe(true);
      expect(
        menuItemInputSchema.safeParse({
          name: 'Burger Deluxe',
          category: 'classic-burgers',
          pricePhp: 148,
          pattySpec: '100g Pure Beef',
          description: 'Classic burger',
          imageUrl: '/images/menu/burger-deluxe.webp',
          available: true,
          featured: true,
          allowAddons: true,
          ...versionField,
        }).success,
      ).toBe(true);
      expect(
        deliveryZoneEnabledPatchSchema.safeParse({ enabled: true, ...versionField }).success,
      ).toBe(true);
      expect(
        deliveryZoneInputSchema.safeParse({
          name: 'Chino Roces',
          areas: 'Yakal, Malugay',
          maxDistanceKm: 2.5,
          feePhp: 35,
          etaMinutes: '15–25 min',
          enabled: true,
          ...versionField,
        }).success,
      ).toBe(true);
      expect(
        deliveryPricingPatchSchema.safeParse({
          freeDeliveryMinSubtotalPhp: 500,
          ...versionField,
        }).success,
      ).toBe(true);
    }

    for (const invalidVersion of [0, -1, 1.5, '1']) {
      expect(
        updateOrderStatusRequestSchema.safeParse({
          status: 'grilling',
          expectedVersion: invalidVersion,
        }).success,
      ).toBe(false);
    }

    expect(
      updateOrderStatusRequestSchema.safeParse({
        status: 'grilling',
        expectedUpdatedAt: '2026-11-22T04:55:12.123Z',
      }).success,
    ).toBe(false);
  });

  it('separates deleted cart lines from sold-out lines and rejects stale explicit delivery zones', () => {
    const soldOutMenu = DEFAULT_MENU_ITEMS.map((item) =>
      item.id === 'burger-deluxe' ? { ...item, available: false } : item,
    );
    const summary = calculateCartDetails(
      [
        { lineId: 'deleted-item', itemId: 'deleted-item', quantity: 2, addonIds: [] },
        { lineId: 'burger-deluxe', itemId: 'burger-deluxe', quantity: 1, addonIds: [] },
        { lineId: 'crinkle-cut-fries', itemId: 'crinkle-cut-fries', quantity: 1, addonIds: [] },
      ],
      soldOutMenu,
    );
    expect(summary.removedLineIds).toEqual(['deleted-item']);
    expect(summary.unavailableLineIds).toEqual(['burger-deluxe']);
    expect(summary.lines).toHaveLength(2);

    const staleZoneQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      zoneId: 'nonexistent-or-paused-zone',
    });
    expect(staleZoneQuote.available).toBe(false);
    expect(staleZoneQuote.zone).toBeNull();
  });

  it('rejects duplicate order lines, sub-0.1km radii, and clamps collided slugs to 120 chars', () => {
    const duplicateLines = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [
        { itemId: 'burger-deluxe', quantity: 1, addonIds: ['bacon', 'sliced-cheese'] },
        { itemId: 'burger-deluxe', quantity: 2, addonIds: ['sliced-cheese', 'bacon'] },
      ],
    });
    expect(duplicateLines.success).toBe(false);

    expect(
      deliveryZoneInputSchema.safeParse({
        name: 'Tiny Zone',
        areas: 'Next door',
        maxDistanceKm: 0.04,
        feePhp: 20,
        etaMinutes: '10 min',
        enabled: true,
      }).success,
    ).toBe(false);

    expect(
      deliveryZoneInputSchema.safeParse({
        name: 'Valid Small Zone',
        areas: 'Next door',
        maxDistanceKm: 0.1,
        feePhp: 20,
        etaMinutes: '10 min',
        enabled: true,
      }).success,
    ).toBe(true);

    const longName = 'a'.repeat(120);
    const collidedMenuId = slugifyMenuId(longName, new Set([longName]));
    const collidedZoneId = slugifyZoneId(longName, new Set([longName]));
    expect(collidedMenuId.length).toBeLessThanOrEqual(120);
    expect(collidedMenuId.endsWith('-2')).toBe(true);
    expect(collidedZoneId.length).toBeLessThanOrEqual(120);
    expect(collidedZoneId.endsWith('-2')).toBe(true);

    expect(
      adminOrdersResponseSchema.safeParse({
        data: [],
        nextCursor: null,
        counts: { all: 0, active: 0, received: 0, grilling: 0, ready: 0, completed: 0 },
      }).success,
    ).toBe(true);
  });
});

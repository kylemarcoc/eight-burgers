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
  deleteMenuImageRequestSchema,
  estimateDeliveryEtaMinutes,
  estimateDeliveryFeePhp,
  estimateRoadDistanceKm,
  formatOrderShareText,
  isSafeImageUrl,
  locationReverseResponseSchema,
  locationSearchResponseSchema,
  menuAvailabilityPatchSchema,
  menuItemInputSchema,
  normalizeAddonIds,
  placeOrderRequestSchema,
  slugifyMenuId,
  updateOrderStatusRequestSchema,
  uploadedMenuImageResponseSchema,
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

  it('requires delivery pin, contact number, and address for delivery orders', () => {
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
      expect(paths).toContain('deliveryPin');
      expect(paths).toContain('contactNumber');
      expect(paths).toContain('addressOrNotes');
    }

    const validDelivery = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      deliveryPin: { lat: 14.5547, lng: 121.0244 },
      addressOrNotes: 'Ayala Avenue, Makati',
      paymentMethod: 'gcash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
    });
    expect(validDelivery.success).toBe(true);

    expect(
      locationSearchResponseSchema.safeParse({
        data: [
          {
            id: 'osm-w-123',
            label: '6749 Ayala Avenue',
            secondaryLabel: 'Makati, Metro Manila',
            coordinates: { lat: 14.5547, lng: 121.0244 },
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      locationReverseResponseSchema.safeParse({
        data: {
          label: 'Chino Roces Avenue, San Antonio, Makati',
          coordinates: { lat: 14.5608, lng: 121.0124 },
        },
      }).success,
    ).toBe(true);
    expect(locationReverseResponseSchema.safeParse({ data: null }).success).toBe(true);
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

  it('estimates delivery fee and ETA deterministically via integer-tenths math', () => {
    expect(estimateDeliveryFeePhp(0, 35, 10)).toBe(35);
    expect(estimateDeliveryFeePhp(1.7, 35, 10)).toBe(52);
    // Half-up rounding parity: 1.5 km * ₱5/km = 7.5 -> 8; + 0 base = 8
    expect(estimateDeliveryFeePhp(1.5, 0, 5)).toBe(8);
    expect(estimateDeliveryFeePhp(-2, 0, 0)).toBe(0);

    expect(estimateDeliveryEtaMinutes(0)).toBe('15–25 min');
    expect(estimateDeliveryEtaMinutes(1.7)).toBe('20–30 min');
    expect(estimateDeliveryEtaMinutes(5.5)).toBe('25–35 min');
    expect(estimateDeliveryEtaMinutes(7.8)).toBe('30–40 min');
    expect(estimateDeliveryEtaMinutes(21.2)).toBe('55–70 min');
  });

  it('estimates road distance and applies base + per-km formula, range guard, paused state, and free-delivery waiver', () => {
    const distMakati = estimateRoadDistanceKm(STORE_ORIGIN_COORDS, { lat: 14.5547, lng: 121.0244 });
    expect(distMakati).toBe(1.9);

    const makatiQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(makatiQuote.available).toBe(true);
    expect(makatiQuote.baseFeePhp).toBe(35);
    expect(makatiQuote.perKmRatePhp).toBe(10);
    expect(makatiQuote.distanceFeePhp).toBe(19);
    expect(makatiQuote.subtotalFeePhp).toBe(54);
    expect(makatiQuote.feePhp).toBe(54);
    expect(makatiQuote.etaMinutes).toBe('20–30 min');
    expect(makatiQuote.isFreeDelivery).toBe(false);
    expect(makatiQuote.amountToFreeDeliveryPhp).toBe(200);

    const bgcQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 298,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.5508, lng: 121.0505 },
    });
    expect(bgcQuote.distanceKm).toBe(5.5);
    expect(bgcQuote.subtotalFeePhp).toBe(90);
    expect(bgcQuote.etaMinutes).toBe('25–35 min');

    const alabangQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 298,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.417, lng: 121.041 },
    });
    expect(alabangQuote.distanceKm).toBe(21.2);
    expect(alabangQuote.subtotalFeePhp).toBe(247);
    expect(alabangQuote.feePhp).toBe(247);
    expect(alabangQuote.etaMinutes).toBe('55–70 min');

    const freeQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 500,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.417, lng: 121.041 },
    });
    expect(freeQuote.isFreeDelivery).toBe(true);
    expect(freeQuote.subtotalFeePhp).toBe(247);
    expect(freeQuote.feePhp).toBe(0);

    const zeroFeeQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 600,
      deliveryPricing: { ...DEFAULT_DELIVERY_PRICING, baseFeePhp: 0, perKmRatePhp: 0 },
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(zeroFeeQuote.subtotalFeePhp).toBe(0);
    expect(zeroFeeQuote.feePhp).toBe(0);
    expect(zeroFeeQuote.isFreeDelivery).toBe(false);

    const prePinQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 200,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: null,
    });
    expect(prePinQuote.available).toBe(true);
    expect(prePinQuote.distanceKm).toBeNull();
    expect(prePinQuote.subtotalFeePhp).toBe(35);
    expect(prePinQuote.etaMinutes).toBeNull();

    const pausedQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: { ...DEFAULT_DELIVERY_PRICING, deliveryEnabled: false },
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(pausedQuote.available).toBe(false);
    expect(pausedQuote.outOfRange).toBe(false);

    const outOfRange = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 500,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.1153, lng: 120.9621 },
    });
    expect(outOfRange.outOfRange).toBe(true);
    expect(outOfRange.available).toBe(false);
    expect(outOfRange.distanceKm).toBe(64.8);
  });

  it('validates positive integer expectedVersion and deliveryPricingPatchSchema bounds', () => {
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
        deliveryPricingPatchSchema.safeParse({
          baseFeePhp: 40,
          perKmRatePhp: 12,
          maxDistanceKm: 20,
          deliveryEnabled: true,
          freeDeliveryMinSubtotalPhp: 500,
          ...versionField,
        }).success,
      ).toBe(true);
      expect(
        deliveryPricingPatchSchema.safeParse({
          freeDeliveryMinSubtotalPhp: null,
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
      expect(
        deliveryPricingPatchSchema.safeParse({
          baseFeePhp: 40,
          expectedVersion: invalidVersion,
        }).success,
      ).toBe(false);
    }

    expect(deliveryPricingPatchSchema.safeParse({}).success).toBe(false);
    expect(deliveryPricingPatchSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(deliveryPricingPatchSchema.safeParse({ baseFeePhp: -1 }).success).toBe(false);
    expect(deliveryPricingPatchSchema.safeParse({ perKmRatePhp: -1 }).success).toBe(false);
    expect(deliveryPricingPatchSchema.safeParse({ maxDistanceKm: 0.04 }).success).toBe(false);
    expect(deliveryPricingPatchSchema.safeParse({ maxDistanceKm: 201 }).success).toBe(false);
    expect(
      updateOrderStatusRequestSchema.safeParse({
        status: 'grilling',
        expectedUpdatedAt: '2026-11-22T04:55:12.123Z',
      }).success,
    ).toBe(false);
  });

  it('separates deleted cart lines from sold-out lines and formats share text without zones', () => {
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

    const shareText = formatOrderShareText({
      id: 'ord-1',
      queueNumber: '#8B-101',
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
    expect(shareText).toContain('Fulfillment: Delivery (~7.8 km · 30–40 min)');
    expect(shareText).not.toContain('Zone');
  });

  it('rejects duplicate order lines and clamps collided slugs to 120 chars', () => {
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

    const longName = 'a'.repeat(120);
    const collidedMenuId = slugifyMenuId(longName, new Set([longName]));
    expect(collidedMenuId.length).toBeLessThanOrEqual(120);
    expect(collidedMenuId.endsWith('-2')).toBe(true);

    expect(
      adminOrdersResponseSchema.safeParse({
        data: [],
        nextCursor: null,
        counts: {
          all: 0,
          active: 0,
          received: 0,
          grilling: 0,
          ready: 0,
          completed: 0,
          cancelled: 0,
        },
      }).success,
    ).toBe(true);

    expect(
      uploadedMenuImageResponseSchema.safeParse({
        data: {
          imageUrl:
            '/storage/v1/object/public/menu-images/items/11111111-2222-4333-8444-555555555555.webp',
          path: 'items/11111111-2222-4333-8444-555555555555.webp',
          sizeBytes: 42_100,
          width: 1200,
          height: 800,
          contentType: 'image/webp',
        },
      }).success,
    ).toBe(true);

    expect(
      deleteMenuImageRequestSchema.safeParse({
        imageUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
  });

  it('handles paused delivery precedence, pickup continuity, exact max-distance boundaries, and partial pause patches', () => {
    const pausedPricing = {
      ...DEFAULT_DELIVERY_PRICING,
      deliveryEnabled: false,
    };

    const pausedInRangeHighSubtotal = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 600,
      deliveryPricing: pausedPricing,
      pin: { lat: 14.5572, lng: 121.0236 },
    });
    expect(pausedInRangeHighSubtotal.available).toBe(false);
    expect(pausedInRangeHighSubtotal.outOfRange).toBe(false);
    expect(pausedInRangeHighSubtotal.feePhp).toBe(0);
    expect(pausedInRangeHighSubtotal.subtotalFeePhp).toBe(0);
    expect(pausedInRangeHighSubtotal.distanceFeePhp).toBe(0);
    expect(pausedInRangeHighSubtotal.etaMinutes).toBeNull();
    expect(pausedInRangeHighSubtotal.isFreeDelivery).toBe(false);
    expect(pausedInRangeHighSubtotal.amountToFreeDeliveryPhp).toBeNull();
    expect(pausedInRangeHighSubtotal.distanceKm).toBeNull();

    const pausedOutOfRange = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: pausedPricing,
      pin: { lat: 14.1153, lng: 120.9621 },
    });
    expect(pausedOutOfRange.available).toBe(false);
    expect(pausedOutOfRange.outOfRange).toBe(false);

    const pickupWhilePaused = calculateDeliveryQuote({
      fulfillment: 'kiosk-pickup',
      subtotalPhp: 148,
      deliveryPricing: pausedPricing,
    });
    expect(pickupWhilePaused.available).toBe(true);
    expect(pickupWhilePaused.outOfRange).toBe(false);
    expect(pickupWhilePaused.feePhp).toBe(0);

    // Makati CBD is 1.9 km from STORE_ORIGIN_COORDS
    const exactBoundaryQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: { ...DEFAULT_DELIVERY_PRICING, maxDistanceKm: 1.9 },
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(exactBoundaryQuote.available).toBe(true);
    expect(exactBoundaryQuote.outOfRange).toBe(false);
    expect(exactBoundaryQuote.distanceKm).toBe(1.9);

    const justBeyondBoundaryQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 300,
      deliveryPricing: { ...DEFAULT_DELIVERY_PRICING, maxDistanceKm: 1.8 },
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(justBeyondBoundaryQuote.available).toBe(false);
    expect(justBeyondBoundaryQuote.outOfRange).toBe(true);
    expect(justBeyondBoundaryQuote.distanceKm).toBe(1.9);
    expect(justBeyondBoundaryQuote.maxDeliveryDistanceKm).toBe(1.8);

    expect(deliveryPricingPatchSchema.safeParse({ deliveryEnabled: false }).success).toBe(true);
    expect(deliveryPricingPatchSchema.safeParse({ deliveryEnabled: true }).success).toBe(true);
  });
});

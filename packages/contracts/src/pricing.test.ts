import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_ITEMS,
  DEFAULT_OPTION_GROUPS,
  STORE_ORIGIN_COORDS,
  adminOrdersResponseSchema,
  buildCartLineId,
  calculateCartDetails,
  calculateDeliveryQuote,
  deleteMenuImageRequestSchema,
  deliveryPricingPatchSchema,
  estimateDeliveryEtaMinutes,
  estimateDeliveryFeePhp,
  estimateRoadDistanceKm,
  formatOrderShareText,
  getDefaultSelectedOptionIds,
  getMenuItemDisplayPrice,
  isMenuItemOrderable,
  isSafeImageUrl,
  locationReverseResponseSchema,
  locationSearchResponseSchema,
  menuAvailabilityPatchSchema,
  menuCategoryInputSchema,
  menuCategoryPatchSchema,
  menuItemInputSchema,
  normalizeSelectedOptionIds,
  optionChoiceAvailabilityPatchSchema,
  optionGroupInputSchema,
  placeOrderRequestSchema,
  sanitizeMenuItemInput,
  slugifyCategoryId,
  slugifyMenuId,
  slugifyOptionGroupId,
  updateOrderStatusRequestSchema,
  uploadedMenuImageResponseSchema,
  validateItemOptionSelections,
  type MenuItem,
  type OptionGroup,
} from './index';

const CAFE_OPTION_GROUPS: readonly OptionGroup[] = [
  {
    id: 'size',
    name: 'Size',
    description: 'Cup size',
    selectionMode: 'single',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 1,
    active: true,
    choices: [
      {
        id: 'regular',
        groupId: 'size',
        name: 'Regular (12oz)',
        priceDeltaPhp: 0,
        available: true,
        isDefault: true,
        sortOrder: 1,
      },
      {
        id: 'large',
        groupId: 'size',
        name: 'Large (16oz)',
        priceDeltaPhp: 25,
        available: true,
        isDefault: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'milk',
    name: 'Milk',
    description: 'Milk base',
    selectionMode: 'single',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 2,
    active: true,
    choices: [
      {
        id: 'full-cream',
        groupId: 'milk',
        name: 'Full Cream',
        priceDeltaPhp: 10,
        available: true,
        isDefault: true,
        sortOrder: 1,
      },
      {
        id: 'oat-milk',
        groupId: 'milk',
        name: 'Oat Milk',
        priceDeltaPhp: 35,
        available: true,
        isDefault: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'toppings',
    name: 'Toppings',
    description: 'Pick up to 2',
    selectionMode: 'multi',
    required: false,
    minSelect: 0,
    maxSelect: 2,
    sortOrder: 3,
    active: true,
    choices: [
      {
        id: 'espresso-shot',
        groupId: 'toppings',
        name: 'Extra Shot',
        priceDeltaPhp: 30,
        available: true,
        isDefault: false,
        sortOrder: 1,
      },
      {
        id: 'whipped-cream',
        groupId: 'toppings',
        name: 'Whipped Cream',
        priceDeltaPhp: 20,
        available: true,
        isDefault: false,
        sortOrder: 2,
      },
      {
        id: 'caramel-drizzle',
        groupId: 'toppings',
        name: 'Caramel Drizzle',
        priceDeltaPhp: 15,
        available: false,
        isDefault: false,
        sortOrder: 3,
      },
    ],
  },
  {
    id: 'paused-group',
    name: 'Seasonal',
    description: 'Inactive group',
    selectionMode: 'single',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 4,
    active: false,
    choices: [
      {
        id: 'pumpkin-spice',
        groupId: 'paused-group',
        name: 'Pumpkin Spice',
        priceDeltaPhp: 40,
        available: true,
        isDefault: false,
        sortOrder: 1,
      },
    ],
  },
];

const ICED_LATTE_ITEM: MenuItem = {
  id: 'iced-latte',
  name: 'Iced Latte',
  category: 'espresso',
  pricePhp: 130,
  specLabel: 'Double Ristretto',
  description: 'House espresso poured over cold milk and ice.',
  imageUrl: '',
  available: true,
  featured: true,
  optionGroupIds: ['size', 'milk', 'toppings', 'paused-group'],
};

describe('contracts schemas and pricing math', () => {
  it('rejects client-injected pricing fields on placeOrderRequestSchema', () => {
    const parsed = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
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
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
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
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
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
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
    });
    expect(parsed.success).toBe(false);
    expect(isSafeImageUrl('/images/menu/burger-deluxe.webp')).toBe(true);
    expect(isSafeImageUrl('https://cdn.example.com/burger.webp')).toBe(true);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('//evil.example.com/x.png')).toBe(false);
  });

  it('normalizes selected options, hashes itemNote into lineIds, and calculates cart totals accurately', () => {
    expect(normalizeSelectedOptionIds(['veggies', 'bacon', 'bacon'])).toEqual(['bacon', 'veggies']);
    expect(buildCartLineId('burger-deluxe', ['veggies', 'bacon'])).toBe(
      'burger-deluxe__bacon+veggies',
    );
    expect(buildCartLineId('burger-deluxe', ['bacon'], '   ')).toBe('burger-deluxe__bacon');

    const lineNoteA = buildCartLineId('burger-deluxe', ['bacon'], 'No onions');
    const lineNoteB = buildCartLineId('burger-deluxe', ['bacon'], 'Extra pickles');
    expect(lineNoteA).not.toBe(lineNoteB);
    expect(lineNoteA).not.toContain('No onions');
    expect(lineNoteA.startsWith('burger-deluxe__bacon~')).toBe(true);

    const summary = calculateCartDetails(
      [
        {
          lineId: 'burger-deluxe__bacon+sliced-cheese',
          itemId: 'burger-deluxe',
          quantity: 2,
          selectedOptionIds: ['bacon', 'sliced-cheese'],
          itemNote: 'Light mayo',
        },
        {
          lineId: 'crinkle-cut-fries',
          itemId: 'crinkle-cut-fries',
          quantity: 1,
          selectedOptionIds: [],
          itemNote: '',
        },
      ],
      DEFAULT_MENU_ITEMS,
      DEFAULT_OPTION_GROUPS,
    );

    expect(summary.totalItems).toBe(3);
    expect(summary.subtotalPhp).toBe((148 + 20 + 20) * 2 + 78);
    expect(summary.unavailableLineIds).toEqual([]);
    expect(summary.invalidOptionLineIds).toEqual([]);
    expect(summary.lines[0]?.itemNote).toBe('Light mayo');
  });

  it('validates required/min/max option groups, sold-out choices, inactive groups, and cart repair flags', () => {
    expect(getDefaultSelectedOptionIds(ICED_LATTE_ITEM, CAFE_OPTION_GROUPS)).toEqual([
      'full-cream',
      'regular',
    ]);

    const validResult = validateItemOptionSelections(
      ICED_LATTE_ITEM,
      ['large', 'oat-milk', 'espresso-shot'],
      CAFE_OPTION_GROUPS,
    );
    expect(validResult.valid).toBe(true);
    expect(validResult.addonsPricePhp).toBe(25 + 35 + 30);
    expect(validResult.selectedOptions.map((o) => o.choiceName)).toEqual([
      'Large (16oz)',
      'Oat Milk',
      'Extra Shot',
    ]);

    // Missing required group (`milk`)
    const missingRequired = validateItemOptionSelections(
      ICED_LATTE_ITEM,
      ['regular'],
      CAFE_OPTION_GROUPS,
    );
    expect(missingRequired.valid).toBe(false);
    expect(missingRequired.missingRequiredGroupIds).toEqual(['milk']);
    expect(missingRequired.issues.some((i) => i.code === 'REQUIRED_OPTION_MISSING')).toBe(true);

    // Exceeds single-select maxSelect=1 on `size`
    const overSingleLimit = validateItemOptionSelections(
      ICED_LATTE_ITEM,
      ['regular', 'large', 'full-cream'],
      CAFE_OPTION_GROUPS,
    );
    expect(overSingleLimit.valid).toBe(false);
    expect(overSingleLimit.overLimitGroupIds).toEqual(['size']);
    expect(overSingleLimit.issues.some((i) => i.code === 'OPTION_LIMIT_EXCEEDED')).toBe(true);

    // Sold-out choice (`caramel-drizzle`)
    const soldOutChoice = validateItemOptionSelections(
      ICED_LATTE_ITEM,
      ['regular', 'full-cream', 'caramel-drizzle'],
      CAFE_OPTION_GROUPS,
    );
    expect(soldOutChoice.valid).toBe(false);
    expect(soldOutChoice.unavailableChoiceIds).toEqual(['caramel-drizzle']);
    expect(soldOutChoice.issues.some((i) => i.code === 'OPTION_UNAVAILABLE')).toBe(true);

    // Choice belonging to an inactive or unlinked group (`pumpkin-spice`)
    const inactiveGroupChoice = validateItemOptionSelections(
      ICED_LATTE_ITEM,
      ['regular', 'full-cream', 'pumpkin-spice'],
      CAFE_OPTION_GROUPS,
    );
    expect(inactiveGroupChoice.valid).toBe(false);
    expect(inactiveGroupChoice.invalidChoiceIds).toEqual(['pumpkin-spice']);
    expect(inactiveGroupChoice.issues.some((i) => i.code === 'INVALID_OPTION_SELECTION')).toBe(
      true,
    );

    // Cart keeps line with sold-out option visible and flags it in invalidOptionLineIds (not unavailableLineIds)
    const cartWithStaleOption = calculateCartDetails(
      [
        {
          lineId: 'iced-latte__caramel-drizzle+full-cream+regular',
          itemId: 'iced-latte',
          quantity: 1,
          selectedOptionIds: ['regular', 'full-cream', 'caramel-drizzle'],
          itemNote: '',
        },
      ],
      [ICED_LATTE_ITEM],
      CAFE_OPTION_GROUPS,
    );
    expect(cartWithStaleOption.lines).toHaveLength(1);
    expect(cartWithStaleOption.unavailableLineIds).toEqual([]);
    expect(cartWithStaleOption.invalidOptionLineIds).toEqual([
      'iced-latte__caramel-drizzle+full-cream+regular',
    ]);
    expect(cartWithStaleOption.lines[0]?.hasInvalidOptions).toBe(true);
  });

  it('computes From ₱X display prices and item orderability when required choices have fees or sell out', () => {
    // Milk group requires 1 choice and cheapest available is +₱10 -> From ₱140
    expect(getMenuItemDisplayPrice(ICED_LATTE_ITEM, CAFE_OPTION_GROUPS)).toEqual({
      pricePhp: 140,
      isFromPrice: true,
    });
    expect(isMenuItemOrderable(ICED_LATTE_ITEM, CAFE_OPTION_GROUPS)).toBe(true);

    // If Regular (+₱0) sells out, Size adds +₱25 and Milk adds +₱10 -> From ₱165
    const sizeRegularSoldOut = CAFE_OPTION_GROUPS.map((group) =>
      group.id === 'size'
        ? {
            ...group,
            choices: group.choices.map((c) =>
              c.id === 'regular' ? { ...c, available: false } : c,
            ),
          }
        : group,
    );
    expect(getMenuItemDisplayPrice(ICED_LATTE_ITEM, sizeRegularSoldOut)).toEqual({
      pricePhp: 165,
      isFromPrice: true,
    });

    // If ALL choices in a required group sell out, item is no longer orderable
    const allMilkSoldOut = CAFE_OPTION_GROUPS.map((group) =>
      group.id === 'milk'
        ? {
            ...group,
            choices: group.choices.map((c) => ({ ...c, available: false })),
          }
        : group,
    );
    expect(isMenuItemOrderable(ICED_LATTE_ITEM, allMilkSoldOut)).toBe(false);

    // Optional-only groups do NOT trigger From ₱X
    const burgerDeluxe = DEFAULT_MENU_ITEMS.find((item) => item.id === 'burger-deluxe');
    expect(burgerDeluxe).toBeDefined();
    if (burgerDeluxe) {
      expect(getMenuItemDisplayPrice(burgerDeluxe, DEFAULT_OPTION_GROUPS)).toEqual({
        pricePhp: 148,
        isFromPrice: false,
      });
    }
  });

  it('validates dynamic category and option group schemas including selection invariants', () => {
    expect(
      menuCategoryInputSchema.parse({
        name: '  Espresso Bar ',
        description: 'Hot and iced espresso drinks',
      }),
    ).toEqual({
      name: 'Espresso Bar',
      description: 'Hot and iced espresso drinks',
      active: true,
    });
    expect(menuCategoryPatchSchema.safeParse({}).success).toBe(false);
    expect(menuCategoryPatchSchema.safeParse({ sortOrder: 2 }).success).toBe(true);

    expect(
      optionGroupInputSchema.safeParse({
        name: 'Size',
        selectionMode: 'single',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        choices: [
          { name: 'Regular', priceDeltaPhp: 0, isDefault: true },
          { name: 'Large', priceDeltaPhp: 25, isDefault: false },
        ],
      }).success,
    ).toBe(true);

    // Single-select must have maxSelect === 1
    expect(
      optionGroupInputSchema.safeParse({
        name: 'Bad Single',
        selectionMode: 'single',
        required: true,
        minSelect: 1,
        maxSelect: 2,
      }).success,
    ).toBe(false);

    // Required group must have minSelect >= 1
    expect(
      optionGroupInputSchema.safeParse({
        name: 'Bad Required',
        selectionMode: 'multi',
        required: true,
        minSelect: 0,
        maxSelect: 2,
      }).success,
    ).toBe(false);

    // maxSelect must be >= minSelect
    expect(
      optionGroupInputSchema.safeParse({
        name: 'Bad Range',
        selectionMode: 'multi',
        required: true,
        minSelect: 3,
        maxSelect: 2,
      }).success,
    ).toBe(false);

    // Single-select cannot have multiple defaults
    expect(
      optionGroupInputSchema.safeParse({
        name: 'Double Default',
        selectionMode: 'single',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        choices: [
          { name: 'A', isDefault: true },
          { name: 'B', isDefault: true },
        ],
      }).success,
    ).toBe(false);

    // Negative choice delta rejected
    expect(
      optionGroupInputSchema.safeParse({
        name: 'Negative Delta',
        choices: [{ name: 'Discount', priceDeltaPhp: -10 }],
      }).success,
    ).toBe(false);

    expect(
      optionChoiceAvailabilityPatchSchema.safeParse({ available: false, expectedVersion: 2 })
        .success,
    ).toBe(true);

    expect(slugifyCategoryId('Espresso & Matcha', new Set(['espresso-matcha']))).toBe(
      'espresso-matcha-2',
    );
    expect(slugifyOptionGroupId('Sugar Level', new Set())).toBe('sugar-level');
  });

  it('estimates delivery fee and ETA deterministically via integer-tenths math', () => {
    expect(estimateDeliveryFeePhp(0, 35, 10)).toBe(35);
    expect(estimateDeliveryFeePhp(1.7, 35, 10)).toBe(52);
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
        updateOrderStatusRequestSchema.safeParse({ status: 'preparing', ...versionField }).success,
      ).toBe(true);
      expect(
        menuAvailabilityPatchSchema.safeParse({ available: false, ...versionField }).success,
      ).toBe(true);
      expect(
        menuItemInputSchema.safeParse({
          name: 'Burger Deluxe',
          category: 'classic-burgers',
          pricePhp: 148,
          specLabel: '100g Pure Beef',
          description: 'Classic burger',
          imageUrl: '/images/menu/burger-deluxe.webp',
          available: true,
          featured: true,
          optionGroupIds: ['add-ons'],
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
          status: 'preparing',
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
        status: 'preparing',
        expectedUpdatedAt: '2026-11-22T04:55:12.123Z',
      }).success,
    ).toBe(false);
  });

  it('separates deleted cart lines from sold-out lines and formats share text with options and itemNote', () => {
    const soldOutMenu = DEFAULT_MENU_ITEMS.map((item) =>
      item.id === 'burger-deluxe' ? { ...item, available: false } : item,
    );
    const summary = calculateCartDetails(
      [
        {
          lineId: 'deleted-item',
          itemId: 'deleted-item',
          quantity: 2,
          selectedOptionIds: [],
          itemNote: '',
        },
        {
          lineId: 'burger-deluxe',
          itemId: 'burger-deluxe',
          quantity: 1,
          selectedOptionIds: [],
          itemNote: '',
        },
        {
          lineId: 'crinkle-cut-fries',
          itemId: 'crinkle-cut-fries',
          quantity: 1,
          selectedOptionIds: [],
          itemNote: '',
        },
      ],
      soldOutMenu,
      DEFAULT_OPTION_GROUPS,
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
      tableNumber: '',
      deliveryEtaMinutes: '30–40 min',
      deliveryPin: { lat: 14.5869, lng: 121.0614 },
      deliveryDistanceKm: 7.8,
      deliveryFeeWaived: true,
      addressOrNotes: 'Ortigas Center, Pasig',
      paymentMethod: 'gcash',
      paymentStatus: 'unpaid',
      paymentReference: '',
      lines: [
        {
          lineId: 'overload-burger',
          itemId: 'overload-burger',
          name: 'Overload Burger',
          unitPricePhp: 298,
          selectedOptions: [
            {
              groupId: 'add-ons',
              groupName: 'Add-ons',
              choiceId: 'bacon',
              choiceName: 'Crispy Bacon',
              priceDeltaPhp: 20,
            },
          ],
          addonNames: ['Crispy Bacon'],
          itemNote: 'No pickles please',
          addonsPricePhp: 20,
          quantity: 2,
          lineTotalPhp: 636,
        },
      ],
      subtotalPhp: 636,
      deliveryFeePhp: 0,
      totalPhp: 636,
      status: 'received',
      createdAtIso: '2026-11-21T10:05:00.000Z',
    });
    expect(shareText).toContain('Fulfillment: Delivery (~7.8 km · 30–40 min)');
    expect(shareText).toContain('- 2x Overload Burger (+ Crispy Bacon) — ₱636');
    expect(shareText).toContain('Note: No pickles please');
    expect(shareText).not.toContain('Zone');
  });

  it('deduplicates order lines using itemId + options + itemNote and allows distinct notes', () => {
    const duplicateLines = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [
        {
          itemId: 'burger-deluxe',
          quantity: 1,
          selectedOptionIds: ['bacon', 'sliced-cheese'],
          itemNote: 'No onions',
        },
        {
          itemId: 'burger-deluxe',
          quantity: 2,
          selectedOptionIds: ['sliced-cheese', 'bacon'],
          itemNote: '  No onions  ',
        },
      ],
    });
    expect(duplicateLines.success).toBe(false);

    const distinctNotes = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [
        {
          itemId: 'burger-deluxe',
          quantity: 1,
          selectedOptionIds: ['bacon'],
          itemNote: 'No onions',
        },
        {
          itemId: 'burger-deluxe',
          quantity: 1,
          selectedOptionIds: ['bacon'],
          itemNote: 'Extra pickles',
        },
      ],
    });
    expect(distinctNotes.success).toBe(true);

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
          preparing: 0,
          ready: 0,
          completed: 0,
          cancelled: 0,
          pendingVerification: 0,
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
      fulfillment: 'pickup',
      subtotalPhp: 148,
      deliveryPricing: pausedPricing,
    });
    expect(pickupWhilePaused.available).toBe(true);
    expect(pickupWhilePaused.outOfRange).toBe(false);
    expect(pickupWhilePaused.feePhp).toBe(0);

    const dineInWhilePaused = calculateDeliveryQuote({
      fulfillment: 'dine-in',
      subtotalPhp: 148,
      deliveryPricing: pausedPricing,
    });
    expect(dineInWhilePaused.available).toBe(true);
    expect(dineInWhilePaused.feePhp).toBe(0);

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

  it('rejects delivery quotes cleanly when originCoords is null and computes from custom store pins', () => {
    const noOriginQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 400,
      deliveryPricing: {
        ...DEFAULT_DELIVERY_PRICING,
        deliveryEnabled: true,
        originCoords: null,
      },
      pin: { lat: 14.5547, lng: 121.0244 },
    });
    expect(noOriginQuote.available).toBe(false);
    expect(noOriginQuote.outOfRange).toBe(false);
    expect(noOriginQuote.distanceKm).toBeNull();
    expect(noOriginQuote.feePhp).toBe(0);

    const explicitNullOriginQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 400,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      pin: { lat: 14.5547, lng: 121.0244 },
      storeOrigin: null,
    });
    expect(explicitNullOriginQuote.available).toBe(false);

    const cebuOrigin = { lat: 10.3157, lng: 123.8854 };
    const cebuItPark = { lat: 10.3304, lng: 123.9064 };
    const cebuQuote = calculateDeliveryQuote({
      fulfillment: 'delivery',
      subtotalPhp: 250,
      deliveryPricing: {
        ...DEFAULT_DELIVERY_PRICING,
        originCoords: cebuOrigin,
      },
      pin: cebuItPark,
    });
    expect(cebuQuote.available).toBe(true);
    expect(cebuQuote.distanceKm).toBe(estimateRoadDistanceKm(cebuOrigin, cebuItPark));
    expect(cebuQuote.distanceKm).toBeLessThan(10);

    const sanitized = sanitizeMenuItemInput({
      name: '   ',
      category: 'BAD CATEGORY!',
      pricePhp: 0,
      specLabel: '  ',
      description: '  ',
      imageUrl: 'javascript:alert(1)',
      available: true,
      featured: false,
      optionGroupIds: ['size', 'milk', 'size', 'INVALID!!'],
    });
    expect(sanitized.name).toBe('Menu Item');
    expect(sanitized.category).toBe('uncategorized');
    expect(sanitized.specLabel).toBe('Regular');
    expect(sanitized.description).toBe('Freshly prepared to order.');
    expect(sanitized.imageUrl).toBe('');
    expect(sanitized.optionGroupIds).toEqual(['size', 'milk']);
  });
});

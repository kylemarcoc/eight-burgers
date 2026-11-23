import { describe, expect, it } from 'vitest';
import {
  ASSET_UPLOAD_PURPOSE_VALUES,
  CURATED_STORE_THEME_PRESET_VALUES,
  DEFAULT_DELIVERY_PRICING,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_MENU_ITEMS,
  DEFAULT_OPTION_GROUPS,
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_STORE_PROFILE,
  STORE_ASSET_UPLOAD_PURPOSE_VALUES,
  STORE_THEME_PRESET_VALUES,
  STORE_THEME_TOKENS,
  catalogPayloadSchema,
  deleteStoreAssetRequestSchema,
  externalLinkSchema,
  formatOrderShareText,
  fulfillmentConfigSchema,
  getContrastRatio,
  normalizeQueueNumber,
  paymentMethodsConfigSchema,
  resolveStoreAccentTokens,
  storeOrderingStatusPatchSchema,
  storeProfilePatchSchema,
  storeProfileSchema,
  uploadedStoreAssetResponseSchema,
  type OrderRecord,
} from './index';

const LIGHT_SURFACES = ['#ffffff', '#faf6f0'] as const;
const DARK_SURFACES = ['#12100e', '#1c1917', '#292524'] as const;

describe('store.schema contracts & WCAG theme tokens', () => {
  it('exposes valid asset upload purposes and brand-neutral DEFAULT_STORE_PROFILE', () => {
    expect(ASSET_UPLOAD_PURPOSE_VALUES).toEqual(['item', 'logo', 'hero', 'payment-qr']);
    expect(STORE_ASSET_UPLOAD_PURPOSE_VALUES).toEqual(['logo', 'hero', 'payment-qr']);
    expect(STORE_THEME_PRESET_VALUES).toEqual([
      'ember',
      'espresso',
      'matcha',
      'berry',
      'ocean',
      'charcoal',
      'custom',
    ]);

    const parsed = storeProfileSchema.parse(DEFAULT_STORE_PROFILE);
    expect(parsed.storeName).toBe('Your Shop');
    expect(parsed.queuePrefix).toBe('ORD');
    expect(parsed.originCoords).toBeNull();
    expect(parsed.acceptingOrders).toBe(true);
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain('8burgers');
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain('chino roces');
  });

  it('guarantees WCAG AA (>= 4.5:1) contrast for every curated preset in light and dark modes', () => {
    for (const preset of CURATED_STORE_THEME_PRESET_VALUES) {
      const tokens = STORE_THEME_TOKENS[preset];
      expect(tokens.label.length).toBeGreaterThan(0);

      for (const surface of LIGHT_SURFACES) {
        expect(getContrastRatio(tokens.light.accent, surface)).toBeGreaterThanOrEqual(4.5);
        expect(getContrastRatio(tokens.light.focusColor, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(getContrastRatio(tokens.light.accent, tokens.light.onAccent)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        getContrastRatio(tokens.light.accentHover, tokens.light.onAccent),
      ).toBeGreaterThanOrEqual(4.5);

      for (const surface of DARK_SURFACES) {
        expect(getContrastRatio(tokens.dark.accent, surface)).toBeGreaterThanOrEqual(4.5);
        expect(getContrastRatio(tokens.dark.focusColor, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(getContrastRatio(tokens.dark.accent, tokens.dark.onAccent)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        getContrastRatio(tokens.dark.accentHover, tokens.dark.onAccent),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clamps arbitrary custom hex colors to WCAG AA (>= 4.5:1) in both light and dark modes', () => {
    const customSamples = [
      '#ffffff',
      '#000000',
      '#ffff00',
      '#00ff00',
      '#0000ff',
      '#777777',
      '#123456',
      '#ff69b4',
      '#fbbf24',
      '#0f172a',
    ];

    for (const hex of customSamples) {
      const resolved = resolveStoreAccentTokens('custom', hex);

      for (const surface of LIGHT_SURFACES) {
        expect(getContrastRatio(resolved.light.accent, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        getContrastRatio(resolved.light.accent, resolved.light.onAccent),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(resolved.light.accentHover, resolved.light.onAccent),
      ).toBeGreaterThanOrEqual(4.5);

      for (const surface of DARK_SURFACES) {
        expect(getContrastRatio(resolved.dark.accent, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(getContrastRatio(resolved.dark.accent, resolved.dark.onAccent)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        getContrastRatio(resolved.dark.accentHover, resolved.dark.onAccent),
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(resolveStoreAccentTokens('custom', null)).toEqual({
      light: STORE_THEME_TOKENS.ember.light,
      dark: STORE_THEME_TOKENS.ember.dark,
    });
    expect(resolveStoreAccentTokens('custom', 'not-a-color')).toEqual({
      light: STORE_THEME_TOKENS.ember.light,
      dark: STORE_THEME_TOKENS.ember.dark,
    });
    expect(resolveStoreAccentTokens('matcha')).toEqual({
      light: STORE_THEME_TOKENS.matcha.light,
      dark: STORE_THEME_TOKENS.matcha.dark,
    });
  });

  it('validates externalLinkSchema strictly for HTTPS URLs without credentials', () => {
    expect(
      externalLinkSchema.parse({
        label: 'Instagram',
        url: 'https://instagram.com/kapekanto',
      }),
    ).toEqual({
      label: 'Instagram',
      url: 'https://instagram.com/kapekanto',
    });

    expect(
      externalLinkSchema.safeParse({
        label: 'Insecure',
        url: 'http://example.com',
      }).success,
    ).toBe(false);

    expect(
      externalLinkSchema.safeParse({
        label: 'Creds',
        url: 'https://user:pass@example.com/shop',
      }).success,
    ).toBe(false);

    expect(
      externalLinkSchema.safeParse({
        label: 'XSS',
        url: 'javascript:alert(1)',
      }).success,
    ).toBe(false);

    expect(
      externalLinkSchema.safeParse({
        label: 'Extra',
        url: 'https://example.com',
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('validates storeProfilePatchSchema, storeOrderingStatusPatchSchema, and asset schemas', () => {
    expect(storeProfilePatchSchema.safeParse({}).success).toBe(false);
    expect(storeProfilePatchSchema.safeParse({ expectedVersion: 2 }).success).toBe(false);
    expect(
      storeProfilePatchSchema.safeParse({ storeName: 'Kape Kanto', unknownField: 1 }).success,
    ).toBe(false);

    const parsedPatch = storeProfilePatchSchema.parse({
      storeName: '  Kape Kanto  ',
      monogram: 'KK',
      queuePrefix: 'kk',
      themeAccentPreset: 'custom',
      themeAccentHex: '#2F6B3C',
      originCoords: { lat: 10.3157, lng: 123.8854 },
      expectedVersion: 3,
    });
    expect(parsedPatch.storeName).toBe('Kape Kanto');
    expect(parsedPatch.queuePrefix).toBe('KK');
    expect(parsedPatch.themeAccentHex).toBe('#2f6b3c');

    expect(
      storeProfilePatchSchema.safeParse({
        themeAccentPreset: 'custom',
        themeAccentHex: null,
      }).success,
    ).toBe(false);

    expect(
      storeProfilePatchSchema.safeParse({
        themeAccentPreset: 'custom',
      }).success,
    ).toBe(false);

    expect(
      storeOrderingStatusPatchSchema.parse({
        acceptingOrders: false,
        closedNotice: 'Back at 2:00 PM',
        expectedVersion: 4,
      }),
    ).toEqual({
      acceptingOrders: false,
      closedNotice: 'Back at 2:00 PM',
      expectedVersion: 4,
    });

    expect(
      uploadedStoreAssetResponseSchema.safeParse({
        data: {
          imageUrl:
            '/storage/v1/object/public/menu-images/branding/11111111-2222-4333-8444-555555555555.webp',
          path: 'branding/11111111-2222-4333-8444-555555555555.webp',
          purpose: 'logo',
          sizeBytes: 12_400,
          width: 512,
          height: 512,
          contentType: 'image/webp',
        },
      }).success,
    ).toBe(true);

    expect(
      deleteStoreAssetRequestSchema.safeParse({
        imageUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);

    expect(
      fulfillmentConfigSchema.safeParse({
        pickupEnabled: false,
        deliveryEnabled: false,
        dineInEnabled: false,
        dineInTableRequired: true,
      }).success,
    ).toBe(false);
    expect(
      fulfillmentConfigSchema.safeParse({
        pickupEnabled: false,
        deliveryEnabled: false,
        dineInEnabled: true,
        dineInTableRequired: true,
      }).success,
    ).toBe(true);

    expect(paymentMethodsConfigSchema.safeParse(DEFAULT_PAYMENT_METHODS).success).toBe(true);
    expect(
      paymentMethodsConfigSchema.safeParse({
        ...DEFAULT_PAYMENT_METHODS,
        cash: { ...DEFAULT_PAYMENT_METHODS.cash, enabled: false },
      }).success,
    ).toBe(false);
    expect(
      storeProfilePatchSchema.safeParse({
        pickupEnabled: false,
        deliveryEnabled: false,
        dineInEnabled: false,
      }).success,
    ).toBe(false);
    expect(
      storeProfilePatchSchema.safeParse({
        deliveryEnabled: true,
        originCoords: null,
      }).success,
    ).toBe(false);
  });

  it('normalizes dynamic and legacy queue prefixes while keeping historical orders trackable', () => {
    expect(normalizeQueueNumber('104')).toBe('#ORD-104');
    expect(normalizeQueueNumber('#104')).toBe('#ORD-104');
    expect(normalizeQueueNumber('104', 'kk')).toBe('#KK-104');
    expect(normalizeQueueNumber('#104', 'CAFE')).toBe('#CAFE-104');
    expect(normalizeQueueNumber('#8B-104', 'KK')).toBe('#8B-104');
    expect(normalizeQueueNumber('8b-104', 'KK')).toBe('#8B-104');
    expect(normalizeQueueNumber('104', 'bad-prefix!')).toBe('#ORD-104');
    expect(normalizeQueueNumber('   ')).toBe('');
  });

  it('formats share text with dynamic storeName, pickupLabel, dine-in table, and payment status', () => {
    const pickupOrder: OrderRecord = {
      id: 'ord-pickup',
      queueNumber: '#KK-205',
      customerName: 'Ana',
      contactNumber: '',
      fulfillment: 'pickup',
      tableNumber: '',
      addressOrNotes: '',
      paymentMethod: 'cash',
      paymentStatus: 'unpaid',
      paymentReference: '',
      lines: [
        {
          lineId: 'burger-deluxe',
          itemId: 'burger-deluxe',
          name: 'Iced Latte',
          unitPricePhp: 140,
          selectedOptions: [
            {
              groupId: 'milk',
              groupName: 'Milk',
              choiceId: 'oat-milk',
              choiceName: 'Oat Milk',
              priceDeltaPhp: 30,
            },
          ],
          addonNames: ['Oat Milk'],
          itemNote: 'Less ice',
          addonsPricePhp: 30,
          quantity: 1,
          lineTotalPhp: 170,
        },
      ],
      subtotalPhp: 170,
      deliveryFeePhp: 0,
      totalPhp: 170,
      status: 'received',
      createdAtIso: '2026-11-24T01:00:00.000Z',
    };

    const customShare = formatOrderShareText(pickupOrder, {
      storeName: 'Kape Kanto',
      pickupLabel: 'Bar Counter',
    });
    expect(customShare).toContain('Kape Kanto Order #KK-205');
    expect(customShare).toContain('Fulfillment: Bar Counter');
    expect(customShare).toContain('Payment: Cash');
    expect(customShare).toContain('1x Iced Latte (+ Oat Milk)');
    expect(customShare).toContain('Note: Less ice');
    expect(customShare).not.toContain('8Burgers');
    expect(customShare).not.toContain('Chino Roces');

    const dineInShare = formatOrderShareText(
      {
        ...pickupOrder,
        fulfillment: 'dine-in',
        tableNumber: '7',
        paymentMethod: 'gcash',
        paymentStatus: 'pending_verification',
        paymentReference: 'GCASH-882190',
      },
      { storeName: 'Kape Kanto' },
    );
    expect(dineInShare).toContain('Fulfillment: Dine-in (Table 7)');
    expect(dineInShare).toContain('Payment: GCash (Pending review)');
    expect(dineInShare).toContain('Payment Ref: GCASH-882190');

    const defaultShare = formatOrderShareText(pickupOrder);
    expect(defaultShare).toContain('Shop Order #KK-205');
    expect(defaultShare).toContain('Fulfillment: Counter Pickup');
  });

  it('requires store profile, categories, optionGroups, and nullable originCoords in catalogPayloadSchema', () => {
    expect(
      catalogPayloadSchema.safeParse({
        store: DEFAULT_STORE_PROFILE,
        categories: DEFAULT_MENU_CATEGORIES,
        optionGroups: DEFAULT_OPTION_GROUPS,
        menu: DEFAULT_MENU_ITEMS,
        deliveryPricing: {
          ...DEFAULT_DELIVERY_PRICING,
          deliveryEnabled: false,
          originCoords: null,
        },
      }).success,
    ).toBe(true);

    expect(
      catalogPayloadSchema.safeParse({
        menu: DEFAULT_MENU_ITEMS,
        categories: DEFAULT_MENU_CATEGORIES,
        optionGroups: DEFAULT_OPTION_GROUPS,
        deliveryPricing: DEFAULT_DELIVERY_PRICING,
      }).success,
    ).toBe(false);
  });
});

import { z } from 'zod';
import { geoCoordinatesSchema } from './delivery.schema';
import { safeImageUrlSchema } from './menu.schema';

export const ASSET_UPLOAD_PURPOSE_VALUES = ['item', 'logo', 'hero', 'payment-qr'] as const;
export const assetUploadPurposeSchema = z.enum(ASSET_UPLOAD_PURPOSE_VALUES);
export type AssetUploadPurpose = z.infer<typeof assetUploadPurposeSchema>;

export const STORE_ASSET_UPLOAD_PURPOSE_VALUES = ['logo', 'hero', 'payment-qr'] as const;
export const storeAssetUploadPurposeSchema = z.enum(STORE_ASSET_UPLOAD_PURPOSE_VALUES);
export type StoreAssetUploadPurpose = z.infer<typeof storeAssetUploadPurposeSchema>;

export const PAYMENT_METHOD_VALUES = ['cash', 'gcash', 'maya', 'bank_transfer'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHOD_VALUES);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
};

export const paymentMethodConfigSchema = z.strictObject({
  enabled: z.boolean(),
  label: z.string().trim().min(1, 'Payment label is required.').max(40),
  accountName: z.string().trim().max(120).default(''),
  accountNumber: z.string().trim().max(80).default(''),
  instructions: z.string().trim().max(280).default(''),
  qrImageUrl: safeImageUrlSchema.default(''),
});
export type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;

export const paymentMethodsConfigSchema = z
  .strictObject({
    cash: paymentMethodConfigSchema,
    gcash: paymentMethodConfigSchema,
    maya: paymentMethodConfigSchema,
    bank_transfer: paymentMethodConfigSchema,
  })
  .refine(
    (methods) =>
      methods.cash.enabled ||
      methods.gcash.enabled ||
      methods.maya.enabled ||
      methods.bank_transfer.enabled,
    {
      message: 'At least one payment method must remain enabled.',
    },
  );
export type PaymentMethodsConfig = z.infer<typeof paymentMethodsConfigSchema>;

export const fulfillmentConfigSchema = z
  .strictObject({
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
    dineInEnabled: z.boolean(),
    dineInTableRequired: z.boolean(),
  })
  .refine((cfg) => cfg.pickupEnabled || cfg.deliveryEnabled || cfg.dineInEnabled, {
    message: 'At least one fulfillment mode must remain enabled.',
  });
export type FulfillmentConfig = z.infer<typeof fulfillmentConfigSchema>;

export const DEFAULT_PAYMENT_METHODS: PaymentMethodsConfig = {
  cash: {
    enabled: true,
    label: 'Cash',
    accountName: '',
    accountNumber: '',
    instructions: 'Pay upon pickup, delivery, or at the counter.',
    qrImageUrl: '',
  },
  gcash: {
    enabled: false,
    label: 'GCash',
    accountName: '',
    accountNumber: '',
    instructions: '',
    qrImageUrl: '',
  },
  maya: {
    enabled: false,
    label: 'Maya',
    accountName: '',
    accountNumber: '',
    instructions: '',
    qrImageUrl: '',
  },
  bank_transfer: {
    enabled: false,
    label: 'Bank Transfer',
    accountName: '',
    accountNumber: '',
    instructions: '',
    qrImageUrl: '',
  },
};

export const CURATED_STORE_THEME_PRESET_VALUES = [
  'ember',
  'espresso',
  'matcha',
  'berry',
  'ocean',
  'charcoal',
] as const;
export type CuratedStoreThemePreset = (typeof CURATED_STORE_THEME_PRESET_VALUES)[number];

export const STORE_THEME_PRESET_VALUES = [...CURATED_STORE_THEME_PRESET_VALUES, 'custom'] as const;
export const storeThemePresetSchema = z.enum(STORE_THEME_PRESET_VALUES);
export type StoreThemePreset = z.infer<typeof storeThemePresetSchema>;

export type StoreAccentTokens = {
  accent: string;
  accentHover: string;
  onAccent: string;
  focusColor: string;
};

export type StoreThemeTokenPair = {
  label: string;
  light: StoreAccentTokens;
  dark: StoreAccentTokens;
};

export const STORE_THEME_TOKENS: Record<CuratedStoreThemePreset, StoreThemeTokenPair> = {
  ember: {
    label: 'Ember',
    light: {
      accent: '#c2410c',
      accentHover: '#9a3412',
      onAccent: '#fffbf7',
      focusColor: '#c2410c',
    },
    dark: {
      accent: '#fb923c',
      accentHover: '#fdba74',
      onAccent: '#1c1917',
      focusColor: '#fb923c',
    },
  },
  espresso: {
    label: 'Espresso',
    light: {
      accent: '#78350f',
      accentHover: '#5c280b',
      onAccent: '#fffbf7',
      focusColor: '#78350f',
    },
    dark: {
      accent: '#e0a96d',
      accentHover: '#ecc293',
      onAccent: '#1c1917',
      focusColor: '#e0a96d',
    },
  },
  matcha: {
    label: 'Matcha',
    light: {
      accent: '#2f6b3c',
      accentHover: '#23522e',
      onAccent: '#fffbf7',
      focusColor: '#2f6b3c',
    },
    dark: {
      accent: '#7fd18b',
      accentHover: '#a2dfa9',
      onAccent: '#1c1917',
      focusColor: '#7fd18b',
    },
  },
  berry: {
    label: 'Berry',
    light: {
      accent: '#9d174d',
      accentHover: '#7f113d',
      onAccent: '#fffbf7',
      focusColor: '#9d174d',
    },
    dark: {
      accent: '#f472b6',
      accentHover: '#f9a8d4',
      onAccent: '#1c1917',
      focusColor: '#f472b6',
    },
  },
  ocean: {
    label: 'Ocean',
    light: {
      accent: '#0369a1',
      accentHover: '#075985',
      onAccent: '#fffbf7',
      focusColor: '#0369a1',
    },
    dark: {
      accent: '#5cc4f8',
      accentHover: '#8ad6fb',
      onAccent: '#1c1917',
      focusColor: '#5cc4f8',
    },
  },
  charcoal: {
    label: 'Charcoal',
    light: {
      accent: '#292524',
      accentHover: '#1c1917',
      onAccent: '#fffbf7',
      focusColor: '#292524',
    },
    dark: {
      accent: '#d6d3d1',
      accentHover: '#e7e5e4',
      onAccent: '#1c1917',
      focusColor: '#d6d3d1',
    },
  },
};

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const LIGHT_SURFACE_CANVAS = '#faf6f0';
const LIGHT_ON_ACCENT = '#fffbf7';
const DARK_SURFACE_MUTED = '#292524';
const DARK_ON_ACCENT = '#1c1917';
const WCAG_AA_CONTRAST_TARGET = 4.6;

type RgbColor = { r: number; g: number; b: number };
type HslColor = { h: number; s: number; l: number };

function parseHexColor(hex: string): RgbColor | null {
  const trimmed = hex.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) return null;
  return {
    r: Number.parseInt(trimmed.slice(1, 3), 16),
    g: Number.parseInt(trimmed.slice(3, 5), 16),
    b: Number.parseInt(trimmed.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  const clampByte = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${clampByte(r)}${clampByte(g)}${clampByte(b)}`;
}

function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  } else if (max === gn) {
    h = ((bn - rn) / delta + 2) / 6;
  } else {
    h = ((rn - gn) / delta + 4) / 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }: HslColor): RgbColor {
  if (s === 0) {
    const channel = Math.round(l * 255);
    return { r: channel, g: channel, b: channel };
  }
  const hueToRgb = (p: number, q: number, t: number) => {
    let wrapped = t;
    if (wrapped < 0) wrapped += 1;
    if (wrapped > 1) wrapped -= 1;
    if (wrapped < 1 / 6) return p + (q - p) * 6 * wrapped;
    if (wrapped < 1 / 2) return q;
    if (wrapped < 2 / 3) return p + (q - p) * (2 / 3 - wrapped) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

function channelToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function getRelativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 0;
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function clampLightAccentHsl(base: HslColor): { accentHex: string; hoverHex: string } {
  const meetsLightAa = (candidateHex: string) =>
    getContrastRatio(candidateHex, LIGHT_SURFACE_CANVAS) >= WCAG_AA_CONTRAST_TARGET &&
    getContrastRatio(candidateHex, LIGHT_ON_ACCENT) >= WCAG_AA_CONTRAST_TARGET;

  let accentL = base.l;
  let accentHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: accentL }));

  if (!meetsLightAa(accentHex)) {
    let low = 0.04;
    let high = accentL;
    for (let i = 0; i < 18; i += 1) {
      const mid = (low + high) / 2;
      const midHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: mid }));
      if (meetsLightAa(midHex)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    accentL = low;
    accentHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: accentL }));
  }

  const targetHoverL =
    accentL > 0.14 ? Math.max(0.05, accentL - 0.08) : Math.min(0.24, accentL + 0.08);
  let hoverHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: targetHoverL }));
  if (!meetsLightAa(hoverHex)) {
    hoverHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: Math.max(0.04, accentL - 0.05) }));
  }

  return { accentHex, hoverHex };
}

function clampDarkAccentHsl(base: HslColor): { accentHex: string; hoverHex: string } {
  const meetsDarkAa = (candidateHex: string) =>
    getContrastRatio(candidateHex, DARK_SURFACE_MUTED) >= WCAG_AA_CONTRAST_TARGET &&
    getContrastRatio(candidateHex, DARK_ON_ACCENT) >= WCAG_AA_CONTRAST_TARGET;

  let accentL = base.l;
  let accentHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: accentL }));

  if (!meetsDarkAa(accentHex)) {
    let low = accentL;
    let high = 0.94;
    for (let i = 0; i < 18; i += 1) {
      const mid = (low + high) / 2;
      const midHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: mid }));
      if (meetsDarkAa(midHex)) {
        high = mid;
      } else {
        low = mid;
      }
    }
    accentL = high;
    accentHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: accentL }));
  }

  const targetHoverL =
    accentL < 0.86 ? Math.min(0.95, accentL + 0.08) : Math.max(0.76, accentL - 0.08);
  let hoverHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: targetHoverL }));
  if (!meetsDarkAa(hoverHex)) {
    hoverHex = rgbToHex(hslToRgb({ h: base.h, s: base.s, l: Math.min(0.95, accentL + 0.05) }));
  }

  return { accentHex, hoverHex };
}

export function resolveStoreAccentTokens(
  preset: StoreThemePreset,
  customHex?: string | null,
): { light: StoreAccentTokens; dark: StoreAccentTokens } {
  if (preset !== 'custom') {
    const tokenPair = STORE_THEME_TOKENS[preset];
    return {
      light: { ...tokenPair.light },
      dark: { ...tokenPair.dark },
    };
  }

  const parsedRgb = customHex ? parseHexColor(customHex) : null;
  if (!parsedRgb) {
    return {
      light: { ...STORE_THEME_TOKENS.ember.light },
      dark: { ...STORE_THEME_TOKENS.ember.dark },
    };
  }

  const hsl = rgbToHsl(parsedRgb);
  const light = clampLightAccentHsl(hsl);
  const dark = clampDarkAccentHsl(hsl);

  return {
    light: {
      accent: light.accentHex,
      accentHover: light.hoverHex,
      onAccent: LIGHT_ON_ACCENT,
      focusColor: light.accentHex,
    },
    dark: {
      accent: dark.accentHex,
      accentHover: dark.hoverHex,
      onAccent: DARK_ON_ACCENT,
      focusColor: dark.accentHex,
    },
  };
}

export function isSafeExternalUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export const externalLinkSchema = z.strictObject({
  label: z.string().trim().min(1, 'Link label is required.').max(40),
  url: z
    .string()
    .trim()
    .max(500)
    .refine(isSafeExternalUrl, 'External links must be HTTPS URLs without credentials.'),
});
export type ExternalLink = z.infer<typeof externalLinkSchema>;

export const storeAccentHexSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR_REGEX, 'Enter a 6-digit hex color (for example, #C2410C).')
  .transform((value) => value.toLowerCase());

export const storeMonogramSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,3}$/, 'Monogram must be 1 to 3 letters or numbers.');

export const storeQueuePrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,4}$/, 'Queue prefix must be 2 to 4 letters or numbers.');

export const storeProfileSchema = z.object({
  storeName: z.string().trim().min(1, 'Store name is required.').max(80),
  branchLabel: z.string().trim().max(120),
  monogram: storeMonogramSchema,
  heroHeadline: z.string().trim().max(160),
  heroSubtext: z.string().trim().max(280),
  heroBadgeLabel: z.string().trim().max(80),
  address: z.string().trim().max(240),
  landmark: z.string().trim().max(200),
  contactPhone: z.string().trim().max(40),
  hoursText: z.string().trim().max(120),
  pickupSpotLabel: z.string().trim().max(80),
  logoUrl: safeImageUrlSchema,
  heroImageUrl: safeImageUrlSchema,
  externalLinks: z.array(externalLinkSchema).max(6),
  queuePrefix: storeQueuePrefixSchema,
  preparingStageLabel: z.string().trim().min(1, 'Preparing stage label is required.').max(40),
  themeAccentPreset: storeThemePresetSchema,
  themeAccentHex: storeAccentHexSchema.nullable(),
  acceptingOrders: z.boolean(),
  closedNotice: z.string().trim().max(200),
  pickupEnabled: z.boolean(),
  deliveryEnabled: z.boolean(),
  dineInEnabled: z.boolean(),
  dineInTableRequired: z.boolean(),
  paymentMethods: paymentMethodsConfigSchema,
  originCoords: geoCoordinatesSchema.nullable(),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type StoreProfile = z.infer<typeof storeProfileSchema>;

export const storeProfilePatchSchema = z
  .strictObject({
    storeName: z.string().trim().min(1, 'Store name is required.').max(80).optional(),
    branchLabel: z.string().trim().max(120).optional(),
    monogram: storeMonogramSchema.optional(),
    heroHeadline: z.string().trim().max(160).optional(),
    heroSubtext: z.string().trim().max(280).optional(),
    heroBadgeLabel: z.string().trim().max(80).optional(),
    address: z.string().trim().max(240).optional(),
    landmark: z.string().trim().max(200).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    hoursText: z.string().trim().max(120).optional(),
    pickupSpotLabel: z.string().trim().max(80).optional(),
    logoUrl: safeImageUrlSchema.optional(),
    heroImageUrl: safeImageUrlSchema.optional(),
    externalLinks: z.array(externalLinkSchema).max(6).optional(),
    queuePrefix: storeQueuePrefixSchema.optional(),
    preparingStageLabel: z
      .string()
      .trim()
      .min(1, 'Preparing stage label is required.')
      .max(40)
      .optional(),
    themeAccentPreset: storeThemePresetSchema.optional(),
    themeAccentHex: storeAccentHexSchema.nullable().optional(),
    acceptingOrders: z.boolean().optional(),
    closedNotice: z.string().trim().max(200).optional(),
    pickupEnabled: z.boolean().optional(),
    deliveryEnabled: z.boolean().optional(),
    dineInEnabled: z.boolean().optional(),
    dineInTableRequired: z.boolean().optional(),
    paymentMethods: paymentMethodsConfigSchema.optional(),
    originCoords: geoCoordinatesSchema.nullable().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((patch, ctx) => {
    const hasUpdatableField =
      patch.storeName !== undefined ||
      patch.branchLabel !== undefined ||
      patch.monogram !== undefined ||
      patch.heroHeadline !== undefined ||
      patch.heroSubtext !== undefined ||
      patch.heroBadgeLabel !== undefined ||
      patch.address !== undefined ||
      patch.landmark !== undefined ||
      patch.contactPhone !== undefined ||
      patch.hoursText !== undefined ||
      patch.pickupSpotLabel !== undefined ||
      patch.logoUrl !== undefined ||
      patch.heroImageUrl !== undefined ||
      patch.externalLinks !== undefined ||
      patch.queuePrefix !== undefined ||
      patch.preparingStageLabel !== undefined ||
      patch.themeAccentPreset !== undefined ||
      patch.themeAccentHex !== undefined ||
      patch.acceptingOrders !== undefined ||
      patch.closedNotice !== undefined ||
      patch.pickupEnabled !== undefined ||
      patch.deliveryEnabled !== undefined ||
      patch.dineInEnabled !== undefined ||
      patch.dineInTableRequired !== undefined ||
      patch.paymentMethods !== undefined ||
      patch.originCoords !== undefined;

    if (!hasUpdatableField) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide at least one store profile field to update.',
      });
    }

    if (
      patch.themeAccentPreset === 'custom' &&
      (patch.themeAccentHex === undefined || patch.themeAccentHex === null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['themeAccentHex'],
        message: 'Provide a valid 6-digit hex color when selecting the custom accent preset.',
      });
    }

    if (
      patch.pickupEnabled === false &&
      patch.deliveryEnabled === false &&
      patch.dineInEnabled === false
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['pickupEnabled'],
        message: 'At least one fulfillment mode must remain enabled.',
      });
    }

    if (patch.deliveryEnabled === true && patch.originCoords === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['originCoords'],
        message: 'Configure a shop location pin before enabling delivery.',
      });
    }
  });
export type StoreProfilePatch = z.infer<typeof storeProfilePatchSchema>;

export const storeOrderingStatusPatchSchema = z.strictObject({
  acceptingOrders: z.boolean(),
  closedNotice: z.string().trim().max(200).optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export type StoreOrderingStatusPatch = z.infer<typeof storeOrderingStatusPatchSchema>;

export const storeProfileResponseSchema = z.object({
  data: storeProfileSchema,
});
export type StoreProfileResponse = z.infer<typeof storeProfileResponseSchema>;

export const uploadedStoreAssetSchema = z.object({
  imageUrl: safeImageUrlSchema,
  path: z.string().min(1).max(200),
  purpose: storeAssetUploadPurposeSchema,
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  contentType: z.literal('image/webp'),
});
export type UploadedStoreAsset = z.infer<typeof uploadedStoreAssetSchema>;

export const uploadedStoreAssetResponseSchema = z.object({
  data: uploadedStoreAssetSchema,
});
export type UploadedStoreAssetResponse = z.infer<typeof uploadedStoreAssetResponseSchema>;

export const deleteStoreAssetRequestSchema = z.strictObject({
  imageUrl: safeImageUrlSchema,
});
export type DeleteStoreAssetRequest = z.infer<typeof deleteStoreAssetRequestSchema>;

export const DEFAULT_STORE_PROFILE: StoreProfile = {
  storeName: 'Your Shop',
  branchLabel: '',
  monogram: 'SH',
  heroHeadline: 'Freshly made to order.',
  heroSubtext: '',
  heroBadgeLabel: '',
  address: '',
  landmark: '',
  contactPhone: '',
  hoursText: '',
  pickupSpotLabel: 'Counter Pickup',
  logoUrl: '',
  heroImageUrl: '',
  externalLinks: [],
  queuePrefix: 'ORD',
  preparingStageLabel: 'Preparing',
  themeAccentPreset: 'ember',
  themeAccentHex: null,
  acceptingOrders: true,
  closedNotice: '',
  pickupEnabled: true,
  deliveryEnabled: false,
  dineInEnabled: false,
  dineInTableRequired: true,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
  originCoords: null,
};

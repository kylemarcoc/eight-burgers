import {
  STORE_THEME_PRESET_VALUES,
  isSafeImageUrl,
  storeAccentHexSchema,
} from '@menu-kiosk/contracts';
import { z } from 'zod';

export const storeBrandingThemeFormSchema = z
  .object({
    logoUrl: z.string(),
    heroImageUrl: z.string(),
    themeAccentPreset: z.enum(STORE_THEME_PRESET_VALUES),
    themeAccentHex: z.string(),
  })
  .superRefine((values, ctx) => {
    const trimmedLogo = values.logoUrl.trim();
    if (!isSafeImageUrl(trimmedLogo) || trimmedLogo.length > 500) {
      ctx.addIssue({
        code: 'custom',
        path: ['logoUrl'],
        message: 'Logo URL must be a valid https:// URL or relative image path.',
      });
    }

    const trimmedHero = values.heroImageUrl.trim();
    if (!isSafeImageUrl(trimmedHero) || trimmedHero.length > 500) {
      ctx.addIssue({
        code: 'custom',
        path: ['heroImageUrl'],
        message: 'Hero banner URL must be a valid https:// URL or relative image path.',
      });
    }

    if (values.themeAccentPreset === 'custom') {
      const hexParsed = storeAccentHexSchema.safeParse(values.themeAccentHex);
      if (!hexParsed.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['themeAccentHex'],
          message:
            hexParsed.error.issues[0]?.message ??
            'Enter a 6-digit hex color (for example, #C2410C).',
        });
      }
    }
  });

export type StoreBrandingThemeFormValues = z.infer<typeof storeBrandingThemeFormSchema>;

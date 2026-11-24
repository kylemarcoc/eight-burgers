import { describe, expect, it } from 'vitest';
import {
  storeBrandingThemeFormSchema,
  type StoreBrandingThemeFormValues,
} from './store-branding-theme-form.schema';

function createValidValues(
  overrides: Partial<StoreBrandingThemeFormValues> = {},
): StoreBrandingThemeFormValues {
  return {
    logoUrl: '/storage/v1/object/public/menu-images/branding/logo.webp',
    heroImageUrl: 'https://cdn.example.com/hero.webp',
    themeAccentPreset: 'ember',
    themeAccentHex: '#c2410c',
    ...overrides,
  };
}

describe('storeBrandingThemeFormSchema', () => {
  it('accepts valid branding URLs and curated presets', () => {
    const parsed = storeBrandingThemeFormSchema.safeParse(createValidValues());
    expect(parsed.success).toBe(true);
  });

  it('ignores invalid custom hex values when a curated preset is active', () => {
    const parsed = storeBrandingThemeFormSchema.safeParse(
      createValidValues({ themeAccentPreset: 'matcha', themeAccentHex: 'invalid' }),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects unsafe logo URLs', () => {
    const parsed = storeBrandingThemeFormSchema.safeParse(
      createValidValues({ logoUrl: 'http://insecure.example.com/logo.png' }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['logoUrl'],
        message: 'Logo URL must be a valid https:// URL or relative image path.',
      });
    }
  });

  it('rejects unsafe hero banner URLs', () => {
    const parsed = storeBrandingThemeFormSchema.safeParse(
      createValidValues({ heroImageUrl: 'javascript:alert(1)' }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['heroImageUrl'],
        message: 'Hero banner URL must be a valid https:// URL or relative image path.',
      });
    }
  });

  it('requires a valid 6-digit hex color when custom preset is selected', () => {
    const invalid = storeBrandingThemeFormSchema.safeParse(
      createValidValues({ themeAccentPreset: 'custom', themeAccentHex: '#123' }),
    );
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.path).toEqual(['themeAccentHex']);
    }

    const valid = storeBrandingThemeFormSchema.safeParse(
      createValidValues({ themeAccentPreset: 'custom', themeAccentHex: '#1D4ED8' }),
    );
    expect(valid.success).toBe(true);
  });
});

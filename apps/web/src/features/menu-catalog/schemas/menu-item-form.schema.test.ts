import { describe, expect, it } from 'vitest';
import {
  createMenuItemFormSchema,
  resolveEffectiveMenuCategory,
  type MenuItemFormValues,
} from './menu-item-form.schema';

function makeValidValues(overrides: Partial<MenuItemFormValues> = {}): MenuItemFormValues {
  return {
    name: 'Classic Burger',
    category: 'burgers',
    pricePhp: '185',
    specLabel: 'Regular',
    description: 'Chargrilled beef patty with house sauce.',
    imageUrl: '',
    available: true,
    featured: false,
    optionGroupIds: [],
    ...overrides,
  };
}

describe('resolveEffectiveMenuCategory', () => {
  it('keeps the selected category when it still exists in the catalog', () => {
    expect(resolveEffectiveMenuCategory('sides', ['burgers', 'sides'])).toBe('sides');
  });

  it('falls back to the first category when the draft category is empty or stale', () => {
    expect(resolveEffectiveMenuCategory('', ['burgers', 'sides'])).toBe('burgers');
    expect(resolveEffectiveMenuCategory('removed-cat', ['burgers', 'sides'])).toBe('burgers');
  });

  it('returns an empty string when no categories exist', () => {
    expect(resolveEffectiveMenuCategory('burgers', [])).toBe('');
  });
});

describe('createMenuItemFormSchema', () => {
  it('accepts an empty draft category when at least one catalog category exists', () => {
    const schema = createMenuItemFormSchema({ categoryIds: ['burgers', 'sides'] });
    const result = schema.safeParse(makeValidValues({ category: '' }));

    expect(result.success).toBe(true);
  });

  it('rejects saving when no categories exist in the catalog', () => {
    const schema = createMenuItemFormSchema({ categoryIds: [] });
    const result = schema.safeParse(makeValidValues({ category: '' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['category'],
          message: 'Create at least one category before saving menu items.',
        }),
      );
    }
  });

  it('rejects invalid price and unsafe image URLs', () => {
    const schema = createMenuItemFormSchema({ categoryIds: ['burgers'] });
    const result = schema.safeParse(
      makeValidValues({ pricePhp: '0', imageUrl: 'javascript:alert(1)' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['pricePhp', 'imageUrl']),
      );
    }
  });
});

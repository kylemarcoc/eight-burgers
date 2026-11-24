import { describe, expect, it } from 'vitest';
import { optionGroupFormSchema, type OptionGroupFormValues } from './option-group-form.schema';

function createValidValues(overrides: Partial<OptionGroupFormValues> = {}): OptionGroupFormValues {
  return {
    name: 'Size',
    description: 'Pick a drink size',
    selectionMode: 'single',
    required: true,
    minSelect: '1',
    maxSelect: '1',
    active: true,
    choices: [
      {
        id: 'regular',
        name: 'Regular',
        priceDeltaPhp: '0',
        available: true,
        isDefault: true,
      },
    ],
    ...overrides,
  };
}

describe('optionGroupFormSchema', () => {
  it('accepts a valid option group draft', () => {
    const parsed = optionGroupFormSchema.safeParse(createValidValues());
    expect(parsed.success).toBe(true);
  });

  it('rejects a blank group name', () => {
    const parsed = optionGroupFormSchema.safeParse(createValidValues({ name: '   ' }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['name'],
        message: 'Enter an option group name.',
      });
    }
  });

  it('rejects out-of-range minimum selections', () => {
    const parsed = optionGroupFormSchema.safeParse(
      createValidValues({
        selectionMode: 'multi',
        required: false,
        minSelect: '51',
        maxSelect: '',
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['minSelect'],
        message: 'Minimum selections must be between 0 and 50.',
      });
    }
  });

  it('rejects maxSelect smaller than minSelect in multi-select mode', () => {
    const parsed = optionGroupFormSchema.safeParse(
      createValidValues({
        selectionMode: 'multi',
        required: true,
        minSelect: '3',
        maxSelect: '2',
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['maxSelect'],
        message: 'Maximum selections cannot be less than minimum selections.',
      });
    }
  });

  it('rejects invalid choice price deltas while skipping blank choice names', () => {
    const parsed = optionGroupFormSchema.safeParse(
      createValidValues({
        choices: [
          { name: '   ', priceDeltaPhp: '-5', available: true, isDefault: false },
          { name: 'Extra Shot', priceDeltaPhp: '-10', available: true, isDefault: false },
        ],
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['choices', 1, 'priceDeltaPhp'],
        message: 'Choice "Extra Shot" must have a non-negative price delta (₱0–₱100,000).',
      });
    }
  });
});

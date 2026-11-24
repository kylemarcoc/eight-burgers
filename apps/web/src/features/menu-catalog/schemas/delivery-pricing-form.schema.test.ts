import { describe, expect, it } from 'vitest';
import {
  createDeliveryPricingFormSchema,
  type DeliveryPricingFormValues,
} from './delivery-pricing-form.schema';

function makeValidValues(
  overrides: Partial<DeliveryPricingFormValues> = {},
): DeliveryPricingFormValues {
  return {
    deliveryEnabled: true,
    baseFeePhp: '35',
    perKmRatePhp: '10',
    maxDistanceKm: '25',
    thresholdEnabled: true,
    thresholdInput: '500',
    ...overrides,
  };
}

describe('createDeliveryPricingFormSchema', () => {
  it('accepts valid delivery pricing when an origin pin is configured', () => {
    const schema = createDeliveryPricingFormSchema({ hasOriginPin: true });
    expect(schema.safeParse(makeValidValues()).success).toBe(true);
  });

  it('blocks enabling delivery when no shop origin pin is configured', () => {
    const schema = createDeliveryPricingFormSchema({ hasOriginPin: false });
    const result = schema.safeParse(makeValidValues({ deliveryEnabled: true }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['deliveryEnabled'],
          message: 'Set your shop location pin in Store Settings before enabling delivery.',
        }),
      );
    }
  });

  it('allows saving paused delivery settings without an origin pin', () => {
    const schema = createDeliveryPricingFormSchema({ hasOriginPin: false });
    expect(schema.safeParse(makeValidValues({ deliveryEnabled: false })).success).toBe(true);
  });

  it('validates minimum subtotal only when the free-delivery threshold is enabled', () => {
    const schema = createDeliveryPricingFormSchema({ hasOriginPin: true });
    expect(
      schema.safeParse(makeValidValues({ thresholdEnabled: false, thresholdInput: '' })).success,
    ).toBe(true);

    const invalid = schema.safeParse(
      makeValidValues({ thresholdEnabled: true, thresholdInput: '0' }),
    );
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['thresholdInput'],
          message: 'Enter a minimum subtotal between ₱1 and ₱100,000.',
        }),
      );
    }
  });
});

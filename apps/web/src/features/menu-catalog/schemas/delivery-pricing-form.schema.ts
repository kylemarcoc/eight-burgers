import { z } from 'zod';

export type DeliveryPricingFormSchemaOptions = {
  hasOriginPin: boolean;
};

export function createDeliveryPricingFormSchema({
  hasOriginPin,
}: DeliveryPricingFormSchemaOptions) {
  return z
    .object({
      deliveryEnabled: z.boolean(),
      baseFeePhp: z.string().refine((value) => {
        const n = Number(value);
        return value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 10000;
      }, 'Enter a base fee between ₱0 and ₱10,000.'),
      perKmRatePhp: z.string().refine((value) => {
        const n = Number(value);
        return value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1000;
      }, 'Enter a per-km rate between ₱0 and ₱1,000.'),
      maxDistanceKm: z.string().refine((value) => {
        const n = Number(value);
        return value.trim() !== '' && Number.isFinite(n) && n >= 0.1 && n <= 200;
      }, 'Enter a max distance between 0.1 km and 200 km.'),
      thresholdEnabled: z.boolean(),
      thresholdInput: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.deliveryEnabled && !hasOriginPin) {
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryEnabled'],
          message: 'Set your shop location pin in Store Settings before enabling delivery.',
        });
      }

      if (values.thresholdEnabled) {
        const n = Number(values.thresholdInput);
        if (values.thresholdInput.trim() === '' || !Number.isFinite(n) || n <= 0 || n > 100000) {
          ctx.addIssue({
            code: 'custom',
            path: ['thresholdInput'],
            message: 'Enter a minimum subtotal between ₱1 and ₱100,000.',
          });
        }
      }
    });
}

export type DeliveryPricingFormValues = z.infer<ReturnType<typeof createDeliveryPricingFormSchema>>;

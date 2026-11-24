import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_VALUES,
  isSafeImageUrl,
} from '@menu-kiosk/contracts';
import { z } from 'zod';

const paymentMethodDraftSchema = z.object({
  enabled: z.boolean(),
  label: z.string(),
  accountName: z.string(),
  accountNumber: z.string(),
  instructions: z.string(),
  qrImageUrl: z.string(),
});

export type FulfillmentPaymentFormSchemaContext = {
  hasOriginPin: boolean;
};

export function createStoreFulfillmentPaymentFormSchema({
  hasOriginPin,
}: FulfillmentPaymentFormSchemaContext) {
  return z
    .object({
      pickupEnabled: z.boolean(),
      deliveryEnabled: z.boolean(),
      dineInEnabled: z.boolean(),
      dineInTableRequired: z.boolean(),
      paymentMethods: z.object({
        cash: paymentMethodDraftSchema,
        gcash: paymentMethodDraftSchema,
        maya: paymentMethodDraftSchema,
        bank_transfer: paymentMethodDraftSchema,
      }),
    })
    .superRefine((values, ctx) => {
      if (!values.pickupEnabled && !values.deliveryEnabled && !values.dineInEnabled) {
        ctx.addIssue({
          code: 'custom',
          path: ['root'],
          message: 'Enable at least one fulfillment mode (Pickup, Delivery, or Dine-in).',
        });
      }
      if (values.deliveryEnabled && !hasOriginPin) {
        ctx.addIssue({
          code: 'custom',
          path: ['root'],
          message: 'Set your shop location pin above before enabling Delivery.',
        });
      }

      let enabledPaymentCount = 0;
      for (const method of PAYMENT_METHOD_VALUES) {
        const cfg = values.paymentMethods[method];
        if (method !== 'cash') {
          const qrUrl = cfg.qrImageUrl.trim();
          if (qrUrl && (!isSafeImageUrl(qrUrl) || qrUrl.length > 500)) {
            ctx.addIssue({
              code: 'custom',
              path: ['paymentMethods', method, 'qrImageUrl'],
              message: `${PAYMENT_METHOD_LABELS[method]} QR URL must be a valid https:// URL or relative image path.`,
            });
          }
        }
        if (cfg.enabled) {
          enabledPaymentCount += 1;
        }
      }

      if (enabledPaymentCount === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['root'],
          message: 'Enable at least one payment method.',
        });
      }
    });
}

export type StoreFulfillmentPaymentFormValues = z.infer<
  ReturnType<typeof createStoreFulfillmentPaymentFormSchema>
>;

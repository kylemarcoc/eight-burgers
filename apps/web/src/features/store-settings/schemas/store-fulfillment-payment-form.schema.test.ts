import { DEFAULT_PAYMENT_METHODS } from '@menu-kiosk/contracts';
import { describe, expect, it } from 'vitest';
import {
  createStoreFulfillmentPaymentFormSchema,
  type StoreFulfillmentPaymentFormValues,
} from './store-fulfillment-payment-form.schema';

function createValidValues(
  overrides: Partial<StoreFulfillmentPaymentFormValues> = {},
): StoreFulfillmentPaymentFormValues {
  return {
    pickupEnabled: true,
    deliveryEnabled: false,
    dineInEnabled: false,
    dineInTableRequired: false,
    paymentMethods: {
      cash: { ...DEFAULT_PAYMENT_METHODS.cash, enabled: true },
      gcash: { ...DEFAULT_PAYMENT_METHODS.gcash },
      maya: { ...DEFAULT_PAYMENT_METHODS.maya },
      bank_transfer: { ...DEFAULT_PAYMENT_METHODS.bank_transfer },
    },
    ...overrides,
  };
}

describe('createStoreFulfillmentPaymentFormSchema', () => {
  it('accepts valid fulfillment and payment settings', () => {
    const schema = createStoreFulfillmentPaymentFormSchema({ hasOriginPin: true });
    const parsed = schema.safeParse(createValidValues({ deliveryEnabled: true }));
    expect(parsed.success).toBe(true);
  });

  it('requires at least one fulfillment mode', () => {
    const schema = createStoreFulfillmentPaymentFormSchema({ hasOriginPin: true });
    const parsed = schema.safeParse(
      createValidValues({ pickupEnabled: false, deliveryEnabled: false, dineInEnabled: false }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['root'],
        message: 'Enable at least one fulfillment mode (Pickup, Delivery, or Dine-in).',
      });
    }
  });

  it('blocks enabling delivery without a configured shop origin pin', () => {
    const schema = createStoreFulfillmentPaymentFormSchema({ hasOriginPin: false });
    const parsed = schema.safeParse(createValidValues({ deliveryEnabled: true }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['root'],
        message: 'Set your shop location pin above before enabling Delivery.',
      });
    }
  });

  it('validates non-cash QR URLs and ignores cash QR URLs', () => {
    const schema = createStoreFulfillmentPaymentFormSchema({ hasOriginPin: true });

    const cashIgnored = schema.safeParse(
      createValidValues({
        paymentMethods: {
          ...createValidValues().paymentMethods,
          cash: {
            ...DEFAULT_PAYMENT_METHODS.cash,
            enabled: true,
            qrImageUrl: 'http://ignored.example.com/qr.png',
          },
        },
      }),
    );
    expect(cashIgnored.success).toBe(true);

    const gcashInvalid = schema.safeParse(
      createValidValues({
        paymentMethods: {
          ...createValidValues().paymentMethods,
          gcash: {
            ...DEFAULT_PAYMENT_METHODS.gcash,
            enabled: true,
            qrImageUrl: 'http://insecure.example.com/qr.png',
          },
        },
      }),
    );
    expect(gcashInvalid.success).toBe(false);
    if (!gcashInvalid.success) {
      expect(gcashInvalid.error.issues[0]).toMatchObject({
        path: ['paymentMethods', 'gcash', 'qrImageUrl'],
        message: 'GCash QR URL must be a valid https:// URL or relative image path.',
      });
    }
  });

  it('requires at least one payment method enabled', () => {
    const schema = createStoreFulfillmentPaymentFormSchema({ hasOriginPin: true });
    const parsed = schema.safeParse(
      createValidValues({
        paymentMethods: {
          ...createValidValues().paymentMethods,
          cash: { ...DEFAULT_PAYMENT_METHODS.cash, enabled: false },
        },
      }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['root'],
        message: 'Enable at least one payment method.',
      });
    }
  });
});

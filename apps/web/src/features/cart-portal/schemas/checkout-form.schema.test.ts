import { describe, expect, it } from 'vitest';
import {
  createCheckoutFormSchema,
  resolveEffectiveFulfillment,
  type CheckoutFormSchemaContext,
  type CheckoutFormValues,
} from './checkout-form.schema';

function createValidValues(overrides: Partial<CheckoutFormValues> = {}): CheckoutFormValues {
  return {
    customerName: 'Alex Santos',
    contactNumber: '',
    selectedFulfillment: null,
    tableNumber: '',
    deliveryPin: null,
    selectedAddress: null,
    addressOrNotes: '',
    paymentMethod: 'cash',
    paymentReference: '',
    ...overrides,
  };
}

function createContext(
  overrides: Partial<CheckoutFormSchemaContext> = {},
): CheckoutFormSchemaContext {
  return {
    enabledFulfillmentModes: ['pickup', 'delivery', 'dine-in'],
    isDineInEnabled: true,
    dineInTable: null,
    dineInTableRequired: false,
    enabledPaymentMethods: ['cash', 'gcash'],
    ...overrides,
  };
}

describe('resolveEffectiveFulfillment', () => {
  it('defaults to dine-in when a table QR is active and no explicit mode is selected', () => {
    expect(
      resolveEffectiveFulfillment(null, {
        enabledFulfillmentModes: ['pickup', 'dine-in'],
        isDineInEnabled: true,
        dineInTable: '7',
      }),
    ).toBe('dine-in');
  });

  it('preserves explicit delivery selection even if delivery was later disabled', () => {
    expect(
      resolveEffectiveFulfillment('delivery', {
        enabledFulfillmentModes: ['pickup'],
        isDineInEnabled: false,
        dineInTable: null,
      }),
    ).toBe('delivery');
  });

  it('falls back to the first enabled mode when the selected mode is no longer enabled', () => {
    expect(
      resolveEffectiveFulfillment('dine-in', {
        enabledFulfillmentModes: ['pickup'],
        isDineInEnabled: false,
        dineInTable: null,
      }),
    ).toBe('pickup');
  });
});

describe('createCheckoutFormSchema', () => {
  it('accepts a valid pickup cash order', () => {
    const schema = createCheckoutFormSchema(createContext());
    expect(schema.safeParse(createValidValues()).success).toBe(true);
  });

  it('requires contact number, pin, and address for delivery unless selectedAddress is set', () => {
    const schema = createCheckoutFormSchema(createContext());

    const missingDeliveryFields = schema.safeParse(
      createValidValues({ selectedFulfillment: 'delivery' }),
    );
    expect(missingDeliveryFields.success).toBe(false);
    if (!missingDeliveryFields.success) {
      expect(missingDeliveryFields.error.issues.map((issue) => issue.path[0])).toEqual([
        'contactNumber',
        'deliveryPin',
        'addressOrNotes',
      ]);
    }

    const validWithSelectedAddress = schema.safeParse(
      createValidValues({
        selectedFulfillment: 'delivery',
        contactNumber: '0917 123 4567',
        deliveryPin: { lat: 14.5547, lng: 121.0244 },
        selectedAddress: 'Ayala Ave, Makati',
      }),
    );
    expect(validWithSelectedAddress.success).toBe(true);
  });

  it('requires table number for dine-in when dineInTableRequired is enabled', () => {
    const schema = createCheckoutFormSchema(
      createContext({ dineInTable: '5', dineInTableRequired: true }),
    );
    const parsed = schema.safeParse(createValidValues({ tableNumber: '   ' }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['tableNumber'],
        message: 'Enter your table number so we can serve your order.',
      });
    }
  });

  it('requires a payment reference when cash is disabled and falls back to an e-wallet', () => {
    const schema = createCheckoutFormSchema(createContext({ enabledPaymentMethods: ['gcash'] }));
    const parsed = schema.safeParse(createValidValues({ paymentMethod: 'cash' }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]).toMatchObject({
        path: ['paymentReference'],
        message: 'Enter the payment reference number from your transfer receipt.',
      });
    }
  });
});

import {
  FULFILLMENT_MODE_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_REFERENCE_MAX_LENGTH,
  TABLE_NUMBER_MAX_LENGTH,
} from '@menu-kiosk/contracts';
import { z } from 'zod';
import { isValidCoordinates } from '@/shared/shop/shop-storage';
import type { FulfillmentMode, GeoCoordinates, PaymentMethod } from '@/shared/shop/types';

export type CheckoutFormValues = {
  customerName: string;
  contactNumber: string;
  selectedFulfillment: FulfillmentMode | null;
  tableNumber: string;
  deliveryPin: GeoCoordinates | null;
  selectedAddress: string | null;
  addressOrNotes: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
};

export type FulfillmentResolutionContext = {
  enabledFulfillmentModes: readonly FulfillmentMode[];
  isDineInEnabled: boolean;
  dineInTable: string | null;
};

export type CheckoutFormSchemaContext = FulfillmentResolutionContext & {
  dineInTableRequired: boolean;
  enabledPaymentMethods: readonly PaymentMethod[];
};

export function resolveEffectiveFulfillment(
  selectedFulfillment: FulfillmentMode | null,
  { enabledFulfillmentModes, isDineInEnabled, dineInTable }: FulfillmentResolutionContext,
): FulfillmentMode {
  if (selectedFulfillment) {
    if (selectedFulfillment === 'delivery') {
      return 'delivery';
    }
    if (enabledFulfillmentModes.includes(selectedFulfillment)) {
      return selectedFulfillment;
    }
  }
  if (dineInTable && isDineInEnabled) {
    return 'dine-in';
  }
  return enabledFulfillmentModes[0] ?? 'pickup';
}

export function createCheckoutFormSchema({
  enabledFulfillmentModes,
  isDineInEnabled,
  dineInTable,
  dineInTableRequired,
  enabledPaymentMethods,
}: CheckoutFormSchemaContext) {
  return z
    .object({
      customerName: z.string().trim().min(1, 'Enter your name so we can call your order.').max(120),
      contactNumber: z.string().max(40),
      selectedFulfillment: z.enum(FULFILLMENT_MODE_VALUES).nullable(),
      tableNumber: z.string().max(TABLE_NUMBER_MAX_LENGTH),
      deliveryPin: z
        .object({
          lat: z.number(),
          lng: z.number(),
        })
        .nullable(),
      selectedAddress: z.string().nullable(),
      addressOrNotes: z.string().max(500),
      paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
      paymentReference: z.string().max(PAYMENT_REFERENCE_MAX_LENGTH),
    })
    .superRefine((values, ctx) => {
      const fulfillment = resolveEffectiveFulfillment(values.selectedFulfillment, {
        enabledFulfillmentModes,
        isDineInEnabled,
        dineInTable,
      });

      if (fulfillment === 'delivery' && !values.contactNumber.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['contactNumber'],
          message: 'Enter a mobile number so the rider can reach you.',
        });
      }
      if (fulfillment === 'dine-in' && dineInTableRequired && !values.tableNumber.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['tableNumber'],
          message: 'Enter your table number so we can serve your order.',
        });
      }
      if (fulfillment === 'delivery' && !isValidCoordinates(values.deliveryPin)) {
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryPin'],
          message: 'Select a delivery address from the suggestions or use your device location.',
        });
      }
      if (
        fulfillment === 'delivery' &&
        !values.addressOrNotes.trim() &&
        !(values.selectedAddress?.trim() ?? '')
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['addressOrNotes'],
          message: 'Enter your street, building, unit, or landmark for the rider.',
        });
      }
      const resolvedMethod = enabledPaymentMethods.includes(values.paymentMethod)
        ? values.paymentMethod
        : (enabledPaymentMethods[0] ?? 'cash');
      if (resolvedMethod !== 'cash' && !values.paymentReference.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['paymentReference'],
          message: 'Enter the payment reference number from your transfer receipt.',
        });
      }
    });
}

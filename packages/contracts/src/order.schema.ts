import { z } from 'zod';
import { deliveryPricingConfigSchema, geoCoordinatesSchema } from './delivery.schema';
import { menuCategorySchema, menuItemSchema, optionGroupSchema, slugIdSchema } from './menu.schema';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_VALUES,
  paymentMethodSchema,
  storeProfileSchema,
  type PaymentMethod,
} from './store.schema';

export { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_VALUES, paymentMethodSchema, type PaymentMethod };

export const ITEM_NOTE_MAX_LENGTH = 140;
export const TABLE_NUMBER_MAX_LENGTH = 24;
export const PAYMENT_REFERENCE_MAX_LENGTH = 80;

export const itemNoteSchema = z
  .string()
  .trim()
  .max(ITEM_NOTE_MAX_LENGTH, 'Special instruction must be 140 characters or fewer.');

export const tableNumberSchema = z
  .string()
  .trim()
  .max(TABLE_NUMBER_MAX_LENGTH, 'Table number must be 24 characters or fewer.');

export const paymentReferenceSchema = z
  .string()
  .trim()
  .max(PAYMENT_REFERENCE_MAX_LENGTH, 'Payment reference must be 80 characters or fewer.');

export const FULFILLMENT_MODE_VALUES = ['pickup', 'delivery', 'dine-in'] as const;
export const fulfillmentModeSchema = z.enum(FULFILLMENT_MODE_VALUES);
export type FulfillmentMode = z.infer<typeof fulfillmentModeSchema>;

export const PAYMENT_STATUS_VALUES = ['unpaid', 'pending_verification', 'paid'] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUS_VALUES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  pending_verification: 'Pending review',
  paid: 'Paid',
};

export const ADMIN_ORDER_PAYMENT_FILTER_VALUES = [
  'all',
  'unpaid',
  'pending_verification',
  'paid',
] as const;
export const adminOrderPaymentFilterSchema = z.enum(ADMIN_ORDER_PAYMENT_FILTER_VALUES);
export type AdminOrderPaymentFilter = z.infer<typeof adminOrderPaymentFilterSchema>;

export const ORDER_STATUS_VALUES = [
  'received',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUS_VALUES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ADMIN_ORDER_STATUS_FILTER_VALUES = [
  'all',
  'active',
  'received',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const;
export const adminOrderStatusFilterSchema = z.enum(ADMIN_ORDER_STATUS_FILTER_VALUES);
export type AdminOrderStatusFilter = z.infer<typeof adminOrderStatusFilterSchema>;

export const ADMIN_ORDER_RANGE_VALUES = ['today', '7d', 'all'] as const;
export const adminOrderRangeSchema = z.enum(ADMIN_ORDER_RANGE_VALUES);
export type AdminOrderRange = z.infer<typeof adminOrderRangeSchema>;

export const ADMIN_ORDER_SORT_VALUES = ['desc', 'asc'] as const;
export const adminOrderSortSchema = z.enum(ADMIN_ORDER_SORT_VALUES);
export type AdminOrderSort = z.infer<typeof adminOrderSortSchema>;

export const adminOrderCountsSchema = z.object({
  all: z.number().int().min(0),
  active: z.number().int().min(0),
  received: z.number().int().min(0),
  preparing: z.number().int().min(0),
  ready: z.number().int().min(0),
  completed: z.number().int().min(0),
  cancelled: z.number().int().min(0),
  pendingVerification: z.number().int().min(0),
});
export type AdminOrderCounts = z.infer<typeof adminOrderCountsSchema>;

export const selectedOptionSnapshotSchema = z.object({
  groupId: slugIdSchema,
  groupName: z.string().min(1).max(80),
  choiceId: slugIdSchema,
  choiceName: z.string().min(1).max(80),
  priceDeltaPhp: z.number().int().min(0).max(100000),
});
export type SelectedOptionSnapshot = z.infer<typeof selectedOptionSnapshotSchema>;

export const cartLineItemSchema = z.object({
  lineId: z.string().min(1).max(500),
  itemId: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(50),
  selectedOptionIds: z.array(slugIdSchema).max(50),
  itemNote: itemNoteSchema.default(''),
});
export type CartLineItem = z.infer<typeof cartLineItemSchema>;

export const placeOrderLineInputSchema = z.strictObject({
  itemId: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(50),
  selectedOptionIds: z.array(slugIdSchema).max(50).default([]),
  itemNote: itemNoteSchema.default(''),
});
export type PlaceOrderLineInput = z.infer<typeof placeOrderLineInputSchema>;

export const placeOrderRequestSchema = z
  .strictObject({
    customerName: z.string().trim().min(1, 'Customer name is required.').max(120),
    contactNumber: z.string().trim().max(40).default(''),
    fulfillment: fulfillmentModeSchema,
    tableNumber: tableNumberSchema.default(''),
    deliveryPin: geoCoordinatesSchema.optional(),
    addressOrNotes: z.string().trim().max(500).default(''),
    paymentMethod: paymentMethodSchema,
    paymentReference: paymentReferenceSchema.default(''),
    items: z
      .array(placeOrderLineInputSchema)
      .min(1, 'At least one item is required.')
      .max(50, 'Order cannot exceed 50 distinct lines.'),
    expectedTotalPhp: z.number().int().min(0).max(1000000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillment === 'delivery') {
      if (!value.deliveryPin) {
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryPin'],
          message: 'Select a delivery address from the suggestions or use your device location.',
        });
      }
      if (!value.contactNumber.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['contactNumber'],
          message: 'Mobile number is required for delivery orders.',
        });
      }
      if (!value.addressOrNotes.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['addressOrNotes'],
          message: 'Delivery address and landmark are required.',
        });
      }
    }
    const seenLineKeys = new Set<string>();
    for (let index = 0; index < value.items.length; index += 1) {
      const line = value.items[index];
      if (!line) continue;
      const normalizedOptions = [...new Set(line.selectedOptionIds)].sort();
      const lineKey = JSON.stringify([line.itemId, normalizedOptions, line.itemNote.trim()]);
      if (seenLineKeys.has(lineKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index],
          message:
            'Duplicate item with the same options and note. Combine quantities onto a single line.',
        });
      } else {
        seenLineKeys.add(lineKey);
      }
    }
  });
export type PlaceOrderRequest = z.infer<typeof placeOrderRequestSchema>;

export const orderLineSnapshotSchema = z.object({
  lineId: z.string().min(1),
  itemId: z.string().min(1),
  name: z.string().min(1),
  unitPricePhp: z.number().int().min(0),
  selectedOptions: z.array(selectedOptionSnapshotSchema).default([]),
  addonNames: z.array(z.string()).default([]),
  itemNote: itemNoteSchema.default(''),
  addonsPricePhp: z.number().int().min(0),
  quantity: z.number().int().positive(),
  lineTotalPhp: z.number().int().min(0),
});
export type OrderLineSnapshot = z.infer<typeof orderLineSnapshotSchema>;

export type OrderCustomerInput = {
  customerName: string;
  contactNumber: string;
  fulfillment: FulfillmentMode;
  tableNumber?: string;
  deliveryPin?: z.infer<typeof geoCoordinatesSchema>;
  addressOrNotes: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
};

export const orderRecordSchema = z.object({
  id: z.string().min(1),
  queueNumber: z.string().min(1),
  customerName: z.string(),
  contactNumber: z.string(),
  fulfillment: fulfillmentModeSchema,
  tableNumber: tableNumberSchema.default(''),
  deliveryEtaMinutes: z.string().optional(),
  deliveryPin: geoCoordinatesSchema.optional(),
  deliveryDistanceKm: z.number().nonnegative().optional(),
  deliveryFeeWaived: z.boolean().optional(),
  addressOrNotes: z.string(),
  paymentMethod: paymentMethodSchema,
  paymentStatus: paymentStatusSchema.default('unpaid'),
  paymentReference: paymentReferenceSchema.default(''),
  lines: z.array(orderLineSnapshotSchema),
  subtotalPhp: z.number().int().min(0),
  deliveryFeePhp: z.number().int().min(0),
  totalPhp: z.number().int().min(0),
  status: orderStatusSchema,
  createdAtIso: z.string(),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type OrderRecord = z.infer<typeof orderRecordSchema>;

export const placeOrderResponseSchema = z.object({
  data: orderRecordSchema,
  receiptToken: z.string().min(16),
});
export type PlaceOrderResponse = z.infer<typeof placeOrderResponseSchema>;

export const orderReceiptResponseSchema = z.object({
  data: orderRecordSchema,
});

export const adminOrdersResponseSchema = z.object({
  data: z.array(orderRecordSchema),
  nextCursor: z.string().nullable(),
  counts: adminOrderCountsSchema.optional(),
});
export type AdminOrdersResponse = z.infer<typeof adminOrdersResponseSchema>;

export const updateOrderStatusRequestSchema = z.strictObject({
  status: orderStatusSchema,
  expectedVersion: z.number().int().positive().optional(),
});
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusRequestSchema>;

export const submitPaymentReferenceRequestSchema = z.strictObject({
  paymentReference: z
    .string()
    .trim()
    .min(1, 'Enter a payment reference number.')
    .max(PAYMENT_REFERENCE_MAX_LENGTH, 'Payment reference must be 80 characters or fewer.'),
});
export type SubmitPaymentReferenceRequest = z.infer<typeof submitPaymentReferenceRequestSchema>;

export const updateOrderPaymentStatusRequestSchema = z.strictObject({
  paymentStatus: paymentStatusSchema,
  expectedVersion: z.number().int().positive().optional(),
});
export type UpdateOrderPaymentStatusRequest = z.infer<typeof updateOrderPaymentStatusRequestSchema>;

export const publicOrderLineSummarySchema = z.object({
  lineId: z.string().trim().min(1).max(500),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(50),
  addonNames: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  selectedOptionNames: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
});
export type PublicOrderLineSummary = z.infer<typeof publicOrderLineSummarySchema>;

export const publicOrderTrackerSchema = z.object({
  queueNumber: z.string().trim().min(1).max(20),
  fulfillment: fulfillmentModeSchema,
  tableNumber: tableNumberSchema.default(''),
  hasContactNumber: z.boolean().optional(),
  paymentStatus: paymentStatusSchema.default('unpaid'),
  deliveryEtaMinutes: z.string().trim().min(1).max(40).optional(),
  lines: z.array(publicOrderLineSummarySchema).min(1).max(50),
  status: orderStatusSchema,
  createdAtIso: z.string(),
  updatedAt: z.string().optional(),
});
export type PublicOrderTracker = z.infer<typeof publicOrderTrackerSchema>;

export const publicOrderTrackerResponseSchema = z.object({
  data: publicOrderTrackerSchema,
});
export type PublicOrderTrackerResponse = z.infer<typeof publicOrderTrackerResponseSchema>;

export const cancelPublicOrderByQueueRequestSchema = z.strictObject({
  contactNumber: z
    .string()
    .trim()
    .min(1, 'Provide the mobile number used on the order.')
    .max(32, 'Mobile number must be 32 characters or fewer.'),
});
export type CancelPublicOrderByQueueRequest = z.infer<typeof cancelPublicOrderByQueueRequestSchema>;

export function canCustomerCancelOrder(order: {
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
}): boolean {
  return order.status === 'received' && (order.paymentStatus ?? 'unpaid') === 'unpaid';
}

export function normalizeQueueNumber(raw: string, queuePrefix = 'ORD'): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const safePrefix = /^[A-Z0-9]{2,4}$/i.test(queuePrefix) ? queuePrefix.toUpperCase() : 'ORD';
  const explicitPrefixMatch = /^#?([A-Z0-9]{2,4})-(\d+)$/i.exec(trimmed);
  if (explicitPrefixMatch?.[1] && explicitPrefixMatch[2]) {
    return `#${explicitPrefixMatch[1].toUpperCase()}-${explicitPrefixMatch[2]}`;
  }
  const numericOnlyMatch = /^#?(\d+)$/.exec(trimmed);
  if (numericOnlyMatch?.[1]) {
    return `#${safePrefix}-${numericOnlyMatch[1]}`;
  }
  const upper = trimmed.toUpperCase();
  return upper.startsWith('#') ? upper : `#${upper}`;
}

export function normalizeContactDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('63')) {
    return `0${digits.slice(2)}`;
  }
  if (digits.length === 10 && digits.startsWith('9')) {
    return `0${digits}`;
  }
  return digits;
}

export const catalogPayloadSchema = z.object({
  store: storeProfileSchema,
  categories: z.array(menuCategorySchema),
  optionGroups: z.array(optionGroupSchema),
  menu: z.array(menuItemSchema),
  deliveryPricing: deliveryPricingConfigSchema,
});
export type CatalogPayload = z.infer<typeof catalogPayloadSchema>;

export const catalogResponseSchema = z.object({
  data: catalogPayloadSchema,
});

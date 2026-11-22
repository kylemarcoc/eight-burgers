import { z } from 'zod';
import { deliveryPricingConfigSchema, geoCoordinatesSchema } from './delivery.schema';
import { menuAddonIdSchema, menuAddonSchema, menuItemSchema } from './menu.schema';

export const FULFILLMENT_MODE_VALUES = ['kiosk-pickup', 'delivery'] as const;
export const fulfillmentModeSchema = z.enum(FULFILLMENT_MODE_VALUES);
export type FulfillmentMode = z.infer<typeof fulfillmentModeSchema>;

export const PAYMENT_METHOD_VALUES = ['cash', 'gcash', 'maya'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHOD_VALUES);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const ORDER_STATUS_VALUES = ['received', 'grilling', 'ready', 'completed'] as const;
export const orderStatusSchema = z.enum(ORDER_STATUS_VALUES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ADMIN_ORDER_STATUS_FILTER_VALUES = [
  'all',
  'active',
  'received',
  'grilling',
  'ready',
  'completed',
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
  grilling: z.number().int().min(0),
  ready: z.number().int().min(0),
  completed: z.number().int().min(0),
});
export type AdminOrderCounts = z.infer<typeof adminOrderCountsSchema>;

export const cartLineItemSchema = z.object({
  lineId: z.string().min(1).max(200),
  itemId: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(50),
  addonIds: z.array(menuAddonIdSchema).max(10),
});
export type CartLineItem = z.infer<typeof cartLineItemSchema>;

export const placeOrderLineInputSchema = z.strictObject({
  itemId: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(50),
  addonIds: z.array(menuAddonIdSchema).max(10).default([]),
});
export type PlaceOrderLineInput = z.infer<typeof placeOrderLineInputSchema>;

export const placeOrderRequestSchema = z
  .strictObject({
    customerName: z.string().trim().min(1, 'Customer name is required.').max(120),
    contactNumber: z.string().trim().max(40).default(''),
    fulfillment: fulfillmentModeSchema,
    deliveryZoneId: z.string().trim().min(1).max(120).optional(),
    deliveryPin: geoCoordinatesSchema.optional(),
    addressOrNotes: z.string().trim().max(500).default(''),
    paymentMethod: paymentMethodSchema,
    items: z
      .array(placeOrderLineInputSchema)
      .min(1, 'At least one item is required.')
      .max(50, 'Order cannot exceed 50 distinct lines.'),
    expectedTotalPhp: z.number().int().min(0).max(1000000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillment === 'delivery') {
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
      const normalizedAddons = [...new Set(line.addonIds)].sort();
      const lineKey =
        normalizedAddons.length > 0 ? `${line.itemId}__${normalizedAddons.join('+')}` : line.itemId;
      if (seenLineKeys.has(lineKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index],
          message: 'Duplicate item with the same add-ons. Combine quantities onto a single line.',
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
  addonNames: z.array(z.string()),
  addonsPricePhp: z.number().int().min(0),
  quantity: z.number().int().positive(),
  lineTotalPhp: z.number().int().min(0),
});
export type OrderLineSnapshot = z.infer<typeof orderLineSnapshotSchema>;

export type OrderCustomerInput = {
  customerName: string;
  contactNumber: string;
  fulfillment: FulfillmentMode;
  deliveryZoneId?: string;
  deliveryPin?: z.infer<typeof geoCoordinatesSchema>;
  addressOrNotes: string;
  paymentMethod: PaymentMethod;
};

export const orderRecordSchema = z.object({
  id: z.string().min(1),
  queueNumber: z.string().min(1),
  customerName: z.string(),
  contactNumber: z.string(),
  fulfillment: fulfillmentModeSchema,
  deliveryZoneId: z.string().optional(),
  deliveryZoneName: z.string().optional(),
  deliveryEtaMinutes: z.string().optional(),
  deliveryPin: geoCoordinatesSchema.optional(),
  deliveryDistanceKm: z.number().nonnegative().optional(),
  deliveryFeeWaived: z.boolean().optional(),
  addressOrNotes: z.string(),
  paymentMethod: paymentMethodSchema,
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

export const catalogPayloadSchema = z.object({
  menu: z.array(menuItemSchema),
  addons: z.array(menuAddonSchema),
  deliveryPricing: deliveryPricingConfigSchema,
});
export type CatalogPayload = z.infer<typeof catalogPayloadSchema>;

export const catalogResponseSchema = z.object({
  data: catalogPayloadSchema,
});

import { describe, expect, it } from 'vitest';
import {
  ADMIN_ORDER_PAYMENT_FILTER_VALUES,
  FULFILLMENT_MODE_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS_VALUES,
  adminOrderCountsSchema,
  canCustomerCancelOrder,
  cancelPublicOrderByQueueRequestSchema,
  locationReverseResponseSchema,
  locationSearchResponseSchema,
  normalizeContactDigits,
  normalizeQueueNumber,
  orderStatusSchema,
  placeOrderRequestSchema,
  publicOrderTrackerSchema,
  submitPaymentReferenceRequestSchema,
  updateOrderPaymentStatusRequestSchema,
} from './index';

describe('order.schema', () => {
  it('validates Phase 3 fulfillment, payment, and order status enums plus adminOrderCountsSchema', () => {
    expect(FULFILLMENT_MODE_VALUES).toEqual(['pickup', 'delivery', 'dine-in']);
    expect(PAYMENT_METHOD_VALUES).toEqual(['cash', 'gcash', 'maya', 'bank_transfer']);
    expect(PAYMENT_STATUS_VALUES).toEqual(['unpaid', 'pending_verification', 'paid']);
    expect(ADMIN_ORDER_PAYMENT_FILTER_VALUES).toEqual([
      'all',
      'unpaid',
      'pending_verification',
      'paid',
    ]);
    expect(ORDER_STATUS_VALUES).toEqual([
      'received',
      'preparing',
      'ready',
      'completed',
      'cancelled',
    ]);
    expect(orderStatusSchema.parse('preparing')).toBe('preparing');
    expect(orderStatusSchema.parse('cancelled')).toBe('cancelled');
    expect(orderStatusSchema.safeParse('grilling').success).toBe(false);

    expect(
      adminOrderCountsSchema.parse({
        all: 5,
        active: 3,
        received: 1,
        preparing: 1,
        ready: 1,
        completed: 1,
        cancelled: 1,
        pendingVerification: 2,
      }),
    ).toEqual({
      all: 5,
      active: 3,
      received: 1,
      preparing: 1,
      ready: 1,
      completed: 1,
      cancelled: 1,
      pendingVerification: 2,
    });
  });

  it('normalizes queue numbers across default, custom, and explicitly prefixed formats', () => {
    expect(normalizeQueueNumber('101')).toBe('#ORD-101');
    expect(normalizeQueueNumber('#101')).toBe('#ORD-101');
    expect(normalizeQueueNumber('101', '8B')).toBe('#8B-101');
    expect(normalizeQueueNumber('#101', '8B')).toBe('#8B-101');
    expect(normalizeQueueNumber('8b-101')).toBe('#8B-101');
    expect(normalizeQueueNumber('  #8B-101  ', 'KK')).toBe('#8B-101');
    expect(normalizeQueueNumber('')).toBe('');
  });

  it('normalizes PH contact numbers across +63, 09, and 9 prefixes', () => {
    expect(normalizeContactDigits('0917-123-4567')).toBe('09171234567');
    expect(normalizeContactDigits('+63 917 123 4567')).toBe('09171234567');
    expect(normalizeContactDigits('9171234567')).toBe('09171234567');
  });

  it('validates publicOrderTrackerSchema with tableNumber & paymentStatus while omitting PII, paymentReference, and itemNote', () => {
    const parsed = publicOrderTrackerSchema.parse({
      queueNumber: '#8B-101',
      fulfillment: 'dine-in',
      tableNumber: '7',
      paymentStatus: 'pending_verification',
      lines: [
        {
          lineId: 'burger-deluxe',
          name: 'Burger Deluxe',
          quantity: 2,
          addonNames: ['Sliced Cheese'],
          selectedOptionNames: ['Sliced Cheese'],
        },
      ],
      status: 'preparing',
      createdAtIso: '2026-11-22T02:00:00.000Z',
      updatedAt: '2026-11-22T02:05:00.000Z',
    });

    expect(parsed.queueNumber).toBe('#8B-101');
    expect(parsed.tableNumber).toBe('7');
    expect(parsed.paymentStatus).toBe('pending_verification');
    expect('customerName' in parsed).toBe(false);
    expect('contactNumber' in parsed).toBe(false);
    expect('addressOrNotes' in parsed).toBe(false);
    expect('paymentReference' in parsed).toBe(false);
    expect('itemNote' in (parsed.lines[0] ?? {})).toBe(false);
    expect(parsed.lines[0]?.selectedOptionNames).toEqual(['Sliced Cheese']);
  });

  it('requires either customerName or contactNumber in cancelPublicOrderByQueueRequestSchema', () => {
    expect(cancelPublicOrderByQueueRequestSchema.safeParse({ customerName: 'Marco' }).success).toBe(
      true,
    );
    expect(
      cancelPublicOrderByQueueRequestSchema.safeParse({ contactNumber: '09171234567' }).success,
    ).toBe(true);
    expect(cancelPublicOrderByQueueRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown deliveryZoneId key and delivery orders without deliveryPin while allowing pickup without pin', () => {
    const legacyZoneOnlyDelivery = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      deliveryZoneId: 'chino-roces-san-antonio',
      deliveryPin: { lat: 14.5608, lng: 121.0124 },
      addressOrNotes: '215 Chino Roces Ave',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
    });
    expect(legacyZoneOnlyDelivery.success).toBe(false);

    const missingPinDelivery = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      addressOrNotes: '215 Chino Roces Ave',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
    });
    expect(missingPinDelivery.success).toBe(false);
    if (!missingPinDelivery.success) {
      expect(missingPinDelivery.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'deliveryPin',
      );
    }

    const pickupWithoutPin = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '',
      fulfillment: 'pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
    });
    expect(pickupWithoutPin.success).toBe(true);

    const legacyKioskPickup = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '',
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
    });
    expect(legacyKioskPickup.success).toBe(false);

    const dineInValid = placeOrderRequestSchema.safeParse({
      customerName: 'Ana',
      contactNumber: '',
      fulfillment: 'dine-in',
      tableNumber: '7',
      addressOrNotes: '',
      paymentMethod: 'bank_transfer',
      paymentReference: 'BPI-987654321',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
    });
    expect(dineInValid.success).toBe(true);

    const dineInMissingName = placeOrderRequestSchema.safeParse({
      customerName: '   ',
      contactNumber: '',
      fulfillment: 'dine-in',
      tableNumber: '7',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, selectedOptionIds: [] }],
    });
    expect(dineInMissingName.success).toBe(false);

    expect(
      submitPaymentReferenceRequestSchema.parse({ paymentReference: '  GCASH-12345  ' }),
    ).toEqual({ paymentReference: 'GCASH-12345' });
    expect(submitPaymentReferenceRequestSchema.safeParse({ paymentReference: '   ' }).success).toBe(
      false,
    );
    expect(
      updateOrderPaymentStatusRequestSchema.parse({ paymentStatus: 'paid', expectedVersion: 2 }),
    ).toEqual({ paymentStatus: 'paid', expectedVersion: 2 });

    expect(canCustomerCancelOrder({ status: 'received', paymentStatus: 'unpaid' })).toBe(true);
    expect(
      canCustomerCancelOrder({ status: 'received', paymentStatus: 'pending_verification' }),
    ).toBe(false);
    expect(canCustomerCancelOrder({ status: 'received', paymentStatus: 'paid' })).toBe(false);
    expect(canCustomerCancelOrder({ status: 'preparing', paymentStatus: 'unpaid' })).toBe(false);
  });

  it('enforces coordinate bounds, item caps, and label bounds on location response schemas', () => {
    expect(
      locationSearchResponseSchema.safeParse({
        data: [
          {
            id: 'osm-w-1',
            label: 'Valid Place',
            coordinates: { lat: 91, lng: 121 },
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      locationSearchResponseSchema.safeParse({
        data: [
          {
            id: 'osm-w-1',
            label: 'Valid Place',
            coordinates: { lat: 14.5, lng: 181 },
          },
        ],
      }).success,
    ).toBe(false);

    const elevenItems = Array.from({ length: 11 }, (_, idx) => ({
      id: `item-${idx}`,
      label: `Place ${idx}`,
      coordinates: { lat: 14.56, lng: 121.01 },
    }));
    expect(locationSearchResponseSchema.safeParse({ data: elevenItems }).success).toBe(false);

    expect(locationReverseResponseSchema.safeParse({ data: null }).success).toBe(true);
    expect(
      locationReverseResponseSchema.safeParse({
        data: { label: '   ', coordinates: { lat: 14.56, lng: 121.01 } },
      }).success,
    ).toBe(false);
    expect(
      locationReverseResponseSchema.safeParse({
        data: { label: 'x'.repeat(251), coordinates: { lat: 14.56, lng: 121.01 } },
      }).success,
    ).toBe(false);
    expect(
      locationReverseResponseSchema.safeParse({
        data: { label: 'x'.repeat(250), coordinates: { lat: 14.56, lng: 121.01 } },
      }).success,
    ).toBe(true);
  });
});

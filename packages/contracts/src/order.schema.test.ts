import { describe, expect, it } from 'vitest';
import {
  adminOrderCountsSchema,
  cancelPublicOrderByQueueRequestSchema,
  locationReverseResponseSchema,
  locationSearchResponseSchema,
  normalizeContactDigits,
  normalizeQueueNumber,
  orderStatusSchema,
  placeOrderRequestSchema,
  publicOrderTrackerSchema,
} from './index';

describe('order.schema', () => {
  it('accepts cancelled in orderStatusSchema and adminOrderCountsSchema', () => {
    expect(orderStatusSchema.parse('cancelled')).toBe('cancelled');
    expect(
      adminOrderCountsSchema.parse({
        all: 5,
        active: 3,
        received: 1,
        grilling: 1,
        ready: 1,
        completed: 1,
        cancelled: 1,
      }),
    ).toEqual({
      all: 5,
      active: 3,
      received: 1,
      grilling: 1,
      ready: 1,
      completed: 1,
      cancelled: 1,
    });
  });

  it('normalizes queue numbers across numeric and #8B- formats', () => {
    expect(normalizeQueueNumber('101')).toBe('#8B-101');
    expect(normalizeQueueNumber('#101')).toBe('#8B-101');
    expect(normalizeQueueNumber('8b-101')).toBe('#8B-101');
    expect(normalizeQueueNumber('  #8B-101  ')).toBe('#8B-101');
    expect(normalizeQueueNumber('')).toBe('');
  });

  it('normalizes PH contact numbers across +63, 09, and 9 prefixes', () => {
    expect(normalizeContactDigits('0917-123-4567')).toBe('09171234567');
    expect(normalizeContactDigits('+63 917 123 4567')).toBe('09171234567');
    expect(normalizeContactDigits('9171234567')).toBe('09171234567');
  });

  it('validates publicOrderTrackerSchema without exposing PII fields', () => {
    const parsed = publicOrderTrackerSchema.parse({
      queueNumber: '#8B-101',
      fulfillment: 'delivery',
      deliveryEtaMinutes: '15–25 min',
      lines: [
        {
          lineId: 'burger-deluxe',
          name: 'Burger Deluxe',
          quantity: 2,
          addonNames: ['Sliced Cheese'],
        },
      ],
      status: 'grilling',
      createdAtIso: '2026-11-22T02:00:00.000Z',
      updatedAt: '2026-11-22T02:05:00.000Z',
    });

    expect(parsed.queueNumber).toBe('#8B-101');
    expect('customerName' in parsed).toBe(false);
    expect('contactNumber' in parsed).toBe(false);
    expect('addressOrNotes' in parsed).toBe(false);
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
      items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
    });
    expect(legacyZoneOnlyDelivery.success).toBe(false);

    const missingPinDelivery = placeOrderRequestSchema.safeParse({
      customerName: 'Marco',
      contactNumber: '09171234567',
      fulfillment: 'delivery',
      addressOrNotes: '215 Chino Roces Ave',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
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
      fulfillment: 'kiosk-pickup',
      addressOrNotes: '',
      paymentMethod: 'cash',
      items: [{ itemId: 'burger-deluxe', quantity: 1, addonIds: [] }],
    });
    expect(pickupWithoutPin.success).toBe(true);
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

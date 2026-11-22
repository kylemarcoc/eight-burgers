import { describe, expect, it } from 'vitest';
import {
  adminOrderCountsSchema,
  cancelPublicOrderByQueueRequestSchema,
  normalizeContactDigits,
  normalizeQueueNumber,
  orderStatusSchema,
  publicOrderTrackerSchema,
} from './order.schema';

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
      deliveryZoneName: 'Chino Roces & San Antonio',
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
});

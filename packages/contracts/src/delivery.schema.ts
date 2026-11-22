import { z } from 'zod';

export const geoCoordinatesSchema = z.strictObject({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
export type GeoCoordinates = z.infer<typeof geoCoordinatesSchema>;

export const deliveryZoneSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  areas: z.string().max(300),
  maxDistanceKm: z.number().finite().positive().max(200),
  feePhp: z.number().int().min(0).max(10000),
  etaMinutes: z.string().min(1).max(60),
  enabled: z.boolean(),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;

export const deliveryZoneInputSchema = z.strictObject({
  name: z.string().trim().min(1, 'Zone name is required.').max(120),
  areas: z.string().trim().max(300),
  maxDistanceKm: z.number().finite().min(0.1, 'Radius must be at least 0.1 km.').max(200),
  feePhp: z.number().int().min(0, 'Fee must be zero or positive.').max(10000),
  etaMinutes: z.string().trim().min(1, 'ETA is required.').max(60),
  enabled: z.boolean(),
  expectedVersion: z.number().int().positive().optional(),
});
export type DeliveryZoneInput = Omit<DeliveryZone, 'id' | 'updatedAt' | 'version'>;
export type DeliveryZoneMutationInput = z.infer<typeof deliveryZoneInputSchema>;

export const deliveryZoneEnabledPatchSchema = z.strictObject({
  enabled: z.boolean(),
  expectedVersion: z.number().int().positive().optional(),
});
export type DeliveryZoneEnabledPatch = z.infer<typeof deliveryZoneEnabledPatchSchema>;

export const deliveryPricingConfigSchema = z.object({
  zones: z.array(deliveryZoneSchema),
  freeDeliveryMinSubtotalPhp: z.number().int().positive().nullable(),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type DeliveryPricingConfig = z.infer<typeof deliveryPricingConfigSchema>;

export const deliveryPricingPatchSchema = z.strictObject({
  freeDeliveryMinSubtotalPhp: z.number().int().positive().max(100000).nullable(),
  expectedVersion: z.number().int().positive().optional(),
});
export type DeliveryPricingPatch = z.infer<typeof deliveryPricingPatchSchema>;

export const deliveryPricingResponseSchema = z.object({
  data: deliveryPricingConfigSchema,
});

export const deliveryZoneResponseSchema = z.object({
  data: deliveryZoneSchema,
});

export const DEFAULT_DELIVERY_FEE_PHP = 35;
export const ROAD_DISTANCE_FACTOR = 1.3;
export const DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP = 500;

export const STORE_ORIGIN_COORDS: GeoCoordinates = {
  lat: 14.5608,
  lng: 121.0124,
};

export const DEFAULT_DELIVERY_ZONES: readonly DeliveryZone[] = [
  {
    id: 'chino-roces-san-antonio',
    name: 'Chino Roces & San Antonio',
    areas: 'Eton WestEnd, Yakal, Malugay, San Antonio Village',
    maxDistanceKm: 2.5,
    feePhp: 35,
    etaMinutes: '15–25 min',
    enabled: true,
  },
  {
    id: 'makati-cbd-poblacion',
    name: 'Makati CBD, Poblacion & Rockwell',
    areas: 'Legazpi, Salcedo, Ayala Ave, Bel-Air, Rockwell, Circuit',
    maxDistanceKm: 5,
    feePhp: 49,
    etaMinutes: '20–35 min',
    enabled: true,
  },
  {
    id: 'bgc-pasay-mandaluyong',
    name: 'BGC, Pasay & Mandaluyong',
    areas: 'Bonifacio High Street, Uptown, MOA, Newport, Greenfield, Shaw',
    maxDistanceKm: 10,
    feePhp: 75,
    etaMinutes: '30–45 min',
    enabled: true,
  },
  {
    id: 'manila-ortigas-pasig',
    name: 'Manila, Ortigas & Pasig',
    areas: 'Malate, Ermita, Taft, Ortigas Center, Kapitolyo, San Juan',
    maxDistanceKm: 16,
    feePhp: 95,
    etaMinutes: '40–55 min',
    enabled: true,
  },
  {
    id: 'qc-south-metro',
    name: 'Quezon City, Parañaque & Alabang',
    areas: 'Cubao, Timog, Diliman, BF Homes, Sucat, Filinvest Alabang',
    maxDistanceKm: 25,
    feePhp: 125,
    etaMinutes: '50–70 min',
    enabled: true,
  },
];

export const DEFAULT_DELIVERY_PRICING: DeliveryPricingConfig = {
  zones: DEFAULT_DELIVERY_ZONES.map((zone) => ({ ...zone })),
  freeDeliveryMinSubtotalPhp: DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
};

import { z } from 'zod';

export const geoCoordinatesSchema = z.strictObject({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
export type GeoCoordinates = z.infer<typeof geoCoordinatesSchema>;

export const deliveryPricingConfigSchema = z.object({
  deliveryEnabled: z.boolean(),
  baseFeePhp: z.number().int().min(0).max(10000),
  perKmRatePhp: z.number().int().min(0).max(1000),
  maxDistanceKm: z.number().finite().min(0.1).max(200),
  freeDeliveryMinSubtotalPhp: z.number().int().positive().nullable(),
  originCoords: geoCoordinatesSchema.nullable(),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type DeliveryPricingConfig = z.infer<typeof deliveryPricingConfigSchema>;

export const deliveryPricingPatchSchema = z
  .strictObject({
    deliveryEnabled: z.boolean().optional(),
    baseFeePhp: z.number().int().min(0).max(10000).optional(),
    perKmRatePhp: z.number().int().min(0).max(1000).optional(),
    maxDistanceKm: z
      .number()
      .finite()
      .min(0.1, 'Max distance must be at least 0.1 km.')
      .max(200)
      .optional(),
    freeDeliveryMinSubtotalPhp: z.number().int().positive().max(100000).nullable().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (patch) =>
      patch.deliveryEnabled !== undefined ||
      patch.baseFeePhp !== undefined ||
      patch.perKmRatePhp !== undefined ||
      patch.maxDistanceKm !== undefined ||
      patch.freeDeliveryMinSubtotalPhp !== undefined,
    {
      message: 'Provide at least one delivery pricing field to update.',
    },
  );
export type DeliveryPricingPatch = z.infer<typeof deliveryPricingPatchSchema>;

export const deliveryPricingResponseSchema = z.object({
  data: deliveryPricingConfigSchema,
});

export const locationSuggestionSchema = z.object({
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(250),
  secondaryLabel: z.string().trim().max(250).optional(),
  coordinates: geoCoordinatesSchema,
});
export type LocationSuggestion = z.infer<typeof locationSuggestionSchema>;

export const locationSearchResponseSchema = z.object({
  data: z.array(locationSuggestionSchema).max(10),
});
export type LocationSearchResponse = z.infer<typeof locationSearchResponseSchema>;

export const locationReverseResultSchema = z.object({
  label: z.string().trim().min(1).max(250),
  coordinates: geoCoordinatesSchema,
});
export type LocationReverseResult = z.infer<typeof locationReverseResultSchema>;

export const locationReverseResponseSchema = z.object({
  data: locationReverseResultSchema.nullable(),
});
export type LocationReverseResponse = z.infer<typeof locationReverseResponseSchema>;

export const DEFAULT_DELIVERY_ENABLED = true;
export const DEFAULT_DELIVERY_BASE_FEE_PHP = 35;
export const DEFAULT_DELIVERY_PER_KM_RATE_PHP = 10;
export const DEFAULT_DELIVERY_MAX_DISTANCE_KM = 25;
export const DEFAULT_DELIVERY_FEE_PHP = DEFAULT_DELIVERY_BASE_FEE_PHP;
export const ROAD_DISTANCE_FACTOR = 1.3;
export const DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP = 500;

export const STORE_ORIGIN_COORDS: GeoCoordinates = {
  lat: 14.5608,
  lng: 121.0124,
};

export const DEFAULT_DELIVERY_PRICING: DeliveryPricingConfig = {
  deliveryEnabled: DEFAULT_DELIVERY_ENABLED,
  baseFeePhp: DEFAULT_DELIVERY_BASE_FEE_PHP,
  perKmRatePhp: DEFAULT_DELIVERY_PER_KM_RATE_PHP,
  maxDistanceKm: DEFAULT_DELIVERY_MAX_DISTANCE_KM,
  freeDeliveryMinSubtotalPhp: DEFAULT_FREE_DELIVERY_MIN_SUBTOTAL_PHP,
  originCoords: STORE_ORIGIN_COORDS,
};

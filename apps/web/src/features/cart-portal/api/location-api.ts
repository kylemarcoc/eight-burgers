import {
  locationReverseResponseSchema,
  locationSearchResponseSchema,
  type GeoCoordinates,
  type LocationSuggestion,
} from '@eight-burgers/contracts';
import { apiRequest } from '@/shared/lib/http-client';

export async function searchDeliveryAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ q: trimmed });
  const response = await apiRequest(`/location/search?${params.toString()}`, {
    method: 'GET',
    schema: locationSearchResponseSchema,
    ...(signal ? { signal } : {}),
  });
  return response.data;
}

export async function reverseGeocodeDeliveryPin(
  coords: GeoCoordinates,
  signal?: AbortSignal,
): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(coords.lat),
    lng: String(coords.lng),
  });
  const response = await apiRequest(`/location/reverse?${params.toString()}`, {
    method: 'GET',
    schema: locationReverseResponseSchema,
    ...(signal ? { signal } : {}),
  });
  return response.data?.label ?? null;
}

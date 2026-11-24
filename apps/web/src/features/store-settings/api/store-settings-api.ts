import {
  locationReverseResponseSchema,
  locationSearchResponseSchema,
  storeProfileResponseSchema,
  uploadedStoreAssetResponseSchema,
  type GeoCoordinates,
  type LocationSuggestion,
  type StoreAssetUploadPurpose,
  type StoreOrderingStatusPatch,
  type StoreProfile,
  type StoreProfilePatch,
  type UploadedStoreAsset,
} from '@menu-kiosk/contracts';
import { apiRequest } from '@/shared/lib/http-client';

export async function patchAdminStoreProfile(patch: StoreProfilePatch): Promise<StoreProfile> {
  const res = await apiRequest('/admin/store-profile', {
    method: 'PATCH',
    body: patch,
    schema: storeProfileResponseSchema,
  });
  return res.data;
}

export async function patchAdminStoreOrderingStatus(
  patch: StoreOrderingStatusPatch,
): Promise<StoreProfile> {
  const res = await apiRequest('/admin/store-ordering-status', {
    method: 'PATCH',
    body: patch,
    schema: storeProfileResponseSchema,
  });
  return res.data;
}

export async function uploadAdminStoreAsset(params: {
  file: File;
  purpose: StoreAssetUploadPurpose;
}): Promise<UploadedStoreAsset> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('purpose', params.purpose);
  const res = await apiRequest('/admin/store-assets', {
    method: 'POST',
    body: formData,
    timeoutMs: 30_000,
    schema: uploadedStoreAssetResponseSchema,
  });
  return res.data;
}

export async function deleteUnusedAdminStoreAsset(imageUrl: string): Promise<void> {
  await apiRequest('/admin/store-assets', {
    method: 'DELETE',
    body: { imageUrl },
  });
}

export async function searchStoreOriginAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ q: trimmed });
  const res = await apiRequest(`/location/search?${params.toString()}`, {
    method: 'GET',
    schema: locationSearchResponseSchema,
    trackForeground: true,
    ...(signal ? { signal } : {}),
  });
  return res.data;
}

export async function reverseGeocodeStoreOrigin(
  coords: GeoCoordinates,
  signal?: AbortSignal,
): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(coords.lat),
    lng: String(coords.lng),
  });
  const res = await apiRequest(`/location/reverse?${params.toString()}`, {
    method: 'GET',
    schema: locationReverseResponseSchema,
    trackForeground: true,
    ...(signal ? { signal } : {}),
  });
  return res.data?.label ?? null;
}

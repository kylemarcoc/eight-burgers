import {
  catalogResponseSchema,
  deliveryPricingResponseSchema,
  deliveryZoneResponseSchema,
  menuItemResponseSchema,
  menuItemsListResponseSchema,
  type CatalogPayload,
  type DeliveryPricingConfig,
  type DeliveryZone,
  type DeliveryZoneInput,
  type MenuItem,
  type MenuItemInput,
} from '@eight-burgers/contracts';
import { apiRequest } from '@/shared/lib/http-client';

export const catalogKeys = {
  all: ['catalog'] as const,
};

export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogPayload> {
  const res = await apiRequest('/catalog', {
    signal,
    schema: catalogResponseSchema,
  });
  return res.data;
}

export async function createAdminMenuItem(input: MenuItemInput): Promise<MenuItem> {
  const res = await apiRequest('/admin/menu-items', {
    method: 'POST',
    body: input,
    schema: menuItemResponseSchema,
  });
  return res.data;
}

export async function updateAdminMenuItem(params: {
  id: string;
  input: MenuItemInput;
  expectedVersion?: number;
}): Promise<MenuItem> {
  const res = await apiRequest(`/admin/menu-items/${encodeURIComponent(params.id)}`, {
    method: 'PUT',
    body: {
      ...params.input,
      ...(params.expectedVersion !== undefined ? { expectedVersion: params.expectedVersion } : {}),
    },
    schema: menuItemResponseSchema,
  });
  return res.data;
}

export async function patchAdminMenuAvailability(params: {
  id: string;
  available: boolean;
  expectedVersion?: number;
}): Promise<MenuItem> {
  const res = await apiRequest(`/admin/menu-items/${encodeURIComponent(params.id)}/availability`, {
    method: 'PATCH',
    body: {
      available: params.available,
      ...(params.expectedVersion !== undefined ? { expectedVersion: params.expectedVersion } : {}),
    },
    schema: menuItemResponseSchema,
  });
  return res.data;
}

export async function deleteAdminMenuItem(id: string): Promise<void> {
  await apiRequest(`/admin/menu-items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function resetAdminMenuCatalog(): Promise<MenuItem[]> {
  const res = await apiRequest('/admin/menu-items/reset', {
    method: 'POST',
    schema: menuItemsListResponseSchema,
  });
  return res.data;
}

export async function patchAdminFreeDeliveryThreshold(params: {
  freeDeliveryMinSubtotalPhp: number | null;
  expectedVersion?: number;
}): Promise<DeliveryPricingConfig> {
  const res = await apiRequest('/admin/delivery-pricing', {
    method: 'PATCH',
    body: {
      freeDeliveryMinSubtotalPhp: params.freeDeliveryMinSubtotalPhp,
      ...(params.expectedVersion !== undefined ? { expectedVersion: params.expectedVersion } : {}),
    },
    schema: deliveryPricingResponseSchema,
  });
  return res.data;
}

export async function createAdminDeliveryZone(input: DeliveryZoneInput): Promise<DeliveryZone> {
  const res = await apiRequest('/admin/delivery-zones', {
    method: 'POST',
    body: input,
    schema: deliveryZoneResponseSchema,
  });
  return res.data;
}

export async function updateAdminDeliveryZone(params: {
  id: string;
  input: DeliveryZoneInput;
  expectedVersion?: number;
}): Promise<DeliveryZone> {
  const res = await apiRequest(`/admin/delivery-zones/${encodeURIComponent(params.id)}`, {
    method: 'PUT',
    body: {
      ...params.input,
      ...(params.expectedVersion !== undefined ? { expectedVersion: params.expectedVersion } : {}),
    },
    schema: deliveryZoneResponseSchema,
  });
  return res.data;
}

export async function patchAdminDeliveryZoneEnabled(params: {
  id: string;
  enabled: boolean;
  expectedVersion?: number;
}): Promise<DeliveryZone> {
  const res = await apiRequest(`/admin/delivery-zones/${encodeURIComponent(params.id)}/enabled`, {
    method: 'PATCH',
    body: {
      enabled: params.enabled,
      ...(params.expectedVersion !== undefined ? { expectedVersion: params.expectedVersion } : {}),
    },
    schema: deliveryZoneResponseSchema,
  });
  return res.data;
}

export async function deleteAdminDeliveryZone(id: string): Promise<void> {
  await apiRequest(`/admin/delivery-zones/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function resetAdminDeliveryPricing(): Promise<DeliveryPricingConfig> {
  const res = await apiRequest('/admin/delivery-pricing/reset', {
    method: 'POST',
    schema: deliveryPricingResponseSchema,
  });
  return res.data;
}

import {
  catalogResponseSchema,
  deliveryPricingResponseSchema,
  menuCategoriesListResponseSchema,
  menuCategoryResponseSchema,
  menuItemResponseSchema,
  menuItemsListResponseSchema,
  optionChoiceResponseSchema,
  optionGroupResponseSchema,
  optionGroupsListResponseSchema,
  uploadedMenuImageResponseSchema,
  type CatalogPayload,
  type DeliveryPricingConfig,
  type DeliveryPricingPatch,
  type MenuCategory,
  type MenuCategoryInput,
  type MenuCategoryPatch,
  type MenuItem,
  type MenuItemInput,
  type OptionChoice,
  type OptionGroup,
  type OptionGroupInput,
  type OptionGroupPatch,
  type UploadedMenuImage,
} from '@menu-kiosk/contracts';
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

export async function uploadAdminMenuImage(file: File): Promise<UploadedMenuImage> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiRequest('/admin/menu-images', {
    method: 'POST',
    body: formData,
    timeoutMs: 30_000,
    schema: uploadedMenuImageResponseSchema,
  });
  return res.data;
}

export async function deleteUnusedAdminMenuImage(imageUrl: string): Promise<void> {
  await apiRequest('/admin/menu-images', {
    method: 'DELETE',
    body: { imageUrl },
  });
}

export async function createAdminCategory(input: MenuCategoryInput): Promise<MenuCategory> {
  const res = await apiRequest('/admin/categories', {
    method: 'POST',
    body: input,
    schema: menuCategoryResponseSchema,
  });
  return res.data;
}

export async function patchAdminCategory(params: {
  id: string;
  patch: MenuCategoryPatch;
}): Promise<MenuCategory> {
  const res = await apiRequest(`/admin/categories/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: params.patch,
    schema: menuCategoryResponseSchema,
  });
  return res.data;
}

export async function reorderAdminCategories(orderedIds: string[]): Promise<MenuCategory[]> {
  const res = await apiRequest('/admin/categories/reorder', {
    method: 'POST',
    body: { orderedIds },
    schema: menuCategoriesListResponseSchema,
  });
  return res.data;
}

export async function deleteAdminCategory(id: string): Promise<void> {
  await apiRequest(`/admin/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function createAdminOptionGroup(input: OptionGroupInput): Promise<OptionGroup> {
  const res = await apiRequest('/admin/option-groups', {
    method: 'POST',
    body: input,
    schema: optionGroupResponseSchema,
  });
  return res.data;
}

export async function patchAdminOptionGroup(params: {
  id: string;
  patch: OptionGroupPatch;
}): Promise<OptionGroup> {
  const res = await apiRequest(`/admin/option-groups/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body: params.patch,
    schema: optionGroupResponseSchema,
  });
  return res.data;
}

export async function reorderAdminOptionGroups(orderedIds: string[]): Promise<OptionGroup[]> {
  const res = await apiRequest('/admin/option-groups/reorder', {
    method: 'POST',
    body: { orderedIds },
    schema: optionGroupsListResponseSchema,
  });
  return res.data;
}

export async function deleteAdminOptionGroup(id: string): Promise<void> {
  await apiRequest(`/admin/option-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function patchAdminOptionChoiceAvailability(params: {
  id: string;
  available: boolean;
  expectedVersion?: number;
}): Promise<OptionChoice> {
  const res = await apiRequest(
    `/admin/option-choices/${encodeURIComponent(params.id)}/availability`,
    {
      method: 'PATCH',
      body: {
        available: params.available,
        ...(params.expectedVersion !== undefined
          ? { expectedVersion: params.expectedVersion }
          : {}),
      },
      schema: optionChoiceResponseSchema,
    },
  );
  return res.data;
}

export async function patchAdminDeliveryPricing(
  params: DeliveryPricingPatch,
): Promise<DeliveryPricingConfig> {
  const res = await apiRequest('/admin/delivery-pricing', {
    method: 'PATCH',
    body: params,
    schema: deliveryPricingResponseSchema,
  });
  return res.data;
}

export async function resetAdminDeliveryPricing(): Promise<DeliveryPricingConfig> {
  const res = await apiRequest('/admin/delivery-pricing/reset', {
    method: 'POST',
    schema: deliveryPricingResponseSchema,
  });
  return res.data;
}

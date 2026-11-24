import type {
  DeliveryPricingPatch,
  MenuCategoryInput,
  MenuCategoryPatch,
  MenuItemInput,
  OptionGroupInput,
  OptionGroupPatch,
} from '@menu-kiosk/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { handleAdminUnauthorizedError } from '@/shared/lib/admin-session-cache';
import { isApiError } from '@/shared/lib/api-error';
import {
  catalogKeys,
  createAdminCategory,
  createAdminMenuItem,
  createAdminOptionGroup,
  deleteAdminCategory,
  deleteAdminMenuItem,
  deleteAdminOptionGroup,
  deleteUnusedAdminMenuImage,
  fetchCatalog,
  patchAdminCategory,
  patchAdminDeliveryPricing,
  patchAdminMenuAvailability,
  patchAdminOptionChoiceAvailability,
  patchAdminOptionGroup,
  reorderAdminCategories,
  reorderAdminOptionGroups,
  resetAdminDeliveryPricing,
  resetAdminMenuCatalog,
  updateAdminMenuItem,
  uploadAdminMenuImage,
} from '../api/catalog-api';

function handleAdminMutationError(queryClient: ReturnType<typeof useQueryClient>, error: unknown) {
  if (handleAdminUnauthorizedError(queryClient, error)) {
    return;
  }
  if (isApiError(error) && error.status === 409) {
    void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  }
}

const CATALOG_QUERY_META = {
  loadingLabel: 'Loading menu…',
} as const;

export function useCatalogQuery() {
  return useQuery({
    queryKey: catalogKeys.all,
    queryFn: ({ signal }) => fetchCatalog(signal),
    staleTime: 30_000,
    meta: CATALOG_QUERY_META,
  });
}

export function useMenuMutations() {
  const queryClient = useQueryClient();

  const invalidateCatalog = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  const onError = (error: unknown) => handleAdminMutationError(queryClient, error);

  const createMenuItem = useMutation({
    mutationFn: (input: MenuItemInput) => createAdminMenuItem(input),
    meta: { loadingLabel: 'Adding menu item…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const updateMenuItem = useMutation({
    mutationFn: (params: { id: string; input: MenuItemInput; expectedVersion?: number }) =>
      updateAdminMenuItem(params),
    meta: { loadingLabel: 'Saving menu item…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const setItemAvailability = useMutation({
    mutationFn: (params: { id: string; available: boolean; expectedVersion?: number }) =>
      patchAdminMenuAvailability(params),
    meta: { loadingLabel: 'Updating item availability…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const deleteMenuItem = useMutation({
    mutationFn: (id: string) => deleteAdminMenuItem(id),
    meta: { loadingLabel: 'Deleting menu item…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const resetCatalog = useMutation({
    mutationFn: () => resetAdminMenuCatalog(),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Resetting demo catalog…',
    },
    onSuccess: invalidateCatalog,
    onError,
  });

  const uploadMenuImage = useMutation({
    mutationFn: (file: File) => uploadAdminMenuImage(file),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Optimizing and uploading image…',
    },
    onError,
  });

  const deleteUnusedMenuImage = useMutation({
    mutationFn: (imageUrl: string) => deleteUnusedAdminMenuImage(imageUrl),
    meta: { suppressLoadingIndicator: true },
    onError,
  });

  return {
    createMenuItem,
    updateMenuItem,
    setItemAvailability,
    deleteMenuItem,
    resetCatalog,
    uploadMenuImage,
    deleteUnusedMenuImage,
  };
}

export function useCategoryMutations() {
  const queryClient = useQueryClient();

  const invalidateCatalog = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  const onError = (error: unknown) => handleAdminMutationError(queryClient, error);

  const createCategory = useMutation({
    mutationFn: (input: MenuCategoryInput) => createAdminCategory(input),
    meta: { loadingLabel: 'Adding category…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const updateCategory = useMutation({
    mutationFn: (params: { id: string; patch: MenuCategoryPatch }) => patchAdminCategory(params),
    meta: { loadingLabel: 'Updating category…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const reorderCategories = useMutation({
    mutationFn: (orderedIds: string[]) => reorderAdminCategories(orderedIds),
    meta: { loadingLabel: 'Reordering categories…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => deleteAdminCategory(id),
    meta: { loadingLabel: 'Deleting category…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  return {
    createCategory,
    updateCategory,
    reorderCategories,
    deleteCategory,
  };
}

export function useOptionGroupMutations() {
  const queryClient = useQueryClient();

  const invalidateCatalog = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  const onError = (error: unknown) => handleAdminMutationError(queryClient, error);

  const createOptionGroup = useMutation({
    mutationFn: (input: OptionGroupInput) => createAdminOptionGroup(input),
    meta: { loadingLabel: 'Adding option group…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const updateOptionGroup = useMutation({
    mutationFn: (params: { id: string; patch: OptionGroupPatch }) => patchAdminOptionGroup(params),
    meta: { loadingLabel: 'Updating option group…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const reorderOptionGroups = useMutation({
    mutationFn: (orderedIds: string[]) => reorderAdminOptionGroups(orderedIds),
    meta: { loadingLabel: 'Reordering option groups…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const deleteOptionGroup = useMutation({
    mutationFn: (id: string) => deleteAdminOptionGroup(id),
    meta: { loadingLabel: 'Deleting option group…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const setOptionChoiceAvailability = useMutation({
    mutationFn: (params: { id: string; available: boolean; expectedVersion?: number }) =>
      patchAdminOptionChoiceAvailability(params),
    meta: { loadingLabel: 'Updating option availability…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  return {
    createOptionGroup,
    updateOptionGroup,
    reorderOptionGroups,
    deleteOptionGroup,
    setOptionChoiceAvailability,
  };
}

export function useDeliveryPricingMutations() {
  const queryClient = useQueryClient();

  const invalidateCatalog = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  const onError = (error: unknown) => handleAdminMutationError(queryClient, error);

  const updateDeliveryPricing = useMutation({
    mutationFn: (params: DeliveryPricingPatch) => patchAdminDeliveryPricing(params),
    meta: { loadingLabel: 'Saving delivery settings…' },
    onSuccess: invalidateCatalog,
    onError,
  });

  const resetDeliveryPricing = useMutation({
    mutationFn: () => resetAdminDeliveryPricing(),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Resetting delivery settings…',
    },
    onSuccess: invalidateCatalog,
    onError,
  });

  return {
    updateDeliveryPricing,
    resetDeliveryPricing,
  };
}

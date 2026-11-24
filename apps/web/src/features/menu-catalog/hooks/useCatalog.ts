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

export function useCatalogQuery() {
  return useQuery({
    queryKey: catalogKeys.all,
    queryFn: ({ signal }) => fetchCatalog(signal),
    staleTime: 30_000,
  });
}

export function useMenuMutations() {
  const queryClient = useQueryClient();

  const invalidateCatalog = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  const onError = (error: unknown) => handleAdminMutationError(queryClient, error);

  const createMenuItem = useMutation({
    mutationFn: (input: MenuItemInput) => createAdminMenuItem(input),
    onSuccess: invalidateCatalog,
    onError,
  });

  const updateMenuItem = useMutation({
    mutationFn: (params: { id: string; input: MenuItemInput; expectedVersion?: number }) =>
      updateAdminMenuItem(params),
    onSuccess: invalidateCatalog,
    onError,
  });

  const setItemAvailability = useMutation({
    mutationFn: (params: { id: string; available: boolean; expectedVersion?: number }) =>
      patchAdminMenuAvailability(params),
    onSuccess: invalidateCatalog,
    onError,
  });

  const deleteMenuItem = useMutation({
    mutationFn: (id: string) => deleteAdminMenuItem(id),
    onSuccess: invalidateCatalog,
    onError,
  });

  const resetCatalog = useMutation({
    mutationFn: () => resetAdminMenuCatalog(),
    onSuccess: invalidateCatalog,
    onError,
  });

  const uploadMenuImage = useMutation({
    mutationFn: (file: File) => uploadAdminMenuImage(file),
    onError,
  });

  const deleteUnusedMenuImage = useMutation({
    mutationFn: (imageUrl: string) => deleteUnusedAdminMenuImage(imageUrl),
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
    onSuccess: invalidateCatalog,
    onError,
  });

  const updateCategory = useMutation({
    mutationFn: (params: { id: string; patch: MenuCategoryPatch }) => patchAdminCategory(params),
    onSuccess: invalidateCatalog,
    onError,
  });

  const reorderCategories = useMutation({
    mutationFn: (orderedIds: string[]) => reorderAdminCategories(orderedIds),
    onSuccess: invalidateCatalog,
    onError,
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => deleteAdminCategory(id),
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
    onSuccess: invalidateCatalog,
    onError,
  });

  const updateOptionGroup = useMutation({
    mutationFn: (params: { id: string; patch: OptionGroupPatch }) => patchAdminOptionGroup(params),
    onSuccess: invalidateCatalog,
    onError,
  });

  const reorderOptionGroups = useMutation({
    mutationFn: (orderedIds: string[]) => reorderAdminOptionGroups(orderedIds),
    onSuccess: invalidateCatalog,
    onError,
  });

  const deleteOptionGroup = useMutation({
    mutationFn: (id: string) => deleteAdminOptionGroup(id),
    onSuccess: invalidateCatalog,
    onError,
  });

  const setOptionChoiceAvailability = useMutation({
    mutationFn: (params: { id: string; available: boolean; expectedVersion?: number }) =>
      patchAdminOptionChoiceAvailability(params),
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
    onSuccess: invalidateCatalog,
    onError,
  });

  const resetDeliveryPricing = useMutation({
    mutationFn: () => resetAdminDeliveryPricing(),
    onSuccess: invalidateCatalog,
    onError,
  });

  return {
    updateDeliveryPricing,
    resetDeliveryPricing,
  };
}

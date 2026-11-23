import type { DeliveryPricingPatch, MenuItemInput } from '@eight-burgers/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/lib/api-error';
import {
  catalogKeys,
  createAdminMenuItem,
  deleteAdminMenuItem,
  deleteUnusedAdminMenuImage,
  fetchCatalog,
  patchAdminDeliveryPricing,
  patchAdminMenuAvailability,
  resetAdminDeliveryPricing,
  resetAdminMenuCatalog,
  updateAdminMenuItem,
  uploadAdminMenuImage,
} from '../api/catalog-api';

function handleAdminMutationError(queryClient: ReturnType<typeof useQueryClient>, error: unknown) {
  if (isApiError(error) && error.status === 401) {
    void queryClient.cancelQueries({ queryKey: ['admin'] });
    queryClient.removeQueries({ queryKey: ['admin', 'orders'] });
    queryClient.setQueryData(['admin', 'auth', 'session'], {
      authenticated: false,
      user: null,
    });
  } else if (isApiError(error) && error.status === 409) {
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

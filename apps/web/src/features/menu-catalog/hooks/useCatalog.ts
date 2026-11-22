import type { DeliveryZoneInput, MenuItemInput } from '@eight-burgers/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/shared/lib/api-error';
import {
  catalogKeys,
  createAdminDeliveryZone,
  createAdminMenuItem,
  deleteAdminDeliveryZone,
  deleteAdminMenuItem,
  fetchCatalog,
  patchAdminDeliveryZoneEnabled,
  patchAdminFreeDeliveryThreshold,
  patchAdminMenuAvailability,
  resetAdminDeliveryPricing,
  resetAdminMenuCatalog,
  updateAdminDeliveryZone,
  updateAdminMenuItem,
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

  return {
    createMenuItem,
    updateMenuItem,
    setItemAvailability,
    deleteMenuItem,
    resetCatalog,
  };
}

export function useDeliveryPricingMutations() {
  const queryClient = useQueryClient();

  const invalidateCatalog = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  const onError = (error: unknown) => handleAdminMutationError(queryClient, error);

  const setFreeDeliveryThreshold = useMutation({
    mutationFn: (params: { freeDeliveryMinSubtotalPhp: number | null; expectedVersion?: number }) =>
      patchAdminFreeDeliveryThreshold(params),
    onSuccess: invalidateCatalog,
    onError,
  });

  const createDeliveryZone = useMutation({
    mutationFn: (input: DeliveryZoneInput) => createAdminDeliveryZone(input),
    onSuccess: invalidateCatalog,
    onError,
  });

  const updateDeliveryZone = useMutation({
    mutationFn: (params: { id: string; input: DeliveryZoneInput; expectedVersion?: number }) =>
      updateAdminDeliveryZone(params),
    onSuccess: invalidateCatalog,
    onError,
  });

  const setDeliveryZoneEnabled = useMutation({
    mutationFn: (params: { id: string; enabled: boolean; expectedVersion?: number }) =>
      patchAdminDeliveryZoneEnabled(params),
    onSuccess: invalidateCatalog,
    onError,
  });

  const deleteDeliveryZone = useMutation({
    mutationFn: (id: string) => deleteAdminDeliveryZone(id),
    onSuccess: invalidateCatalog,
    onError,
  });

  const resetDeliveryPricing = useMutation({
    mutationFn: () => resetAdminDeliveryPricing(),
    onSuccess: invalidateCatalog,
    onError,
  });

  return {
    setFreeDeliveryThreshold,
    createDeliveryZone,
    updateDeliveryZone,
    setDeliveryZoneEnabled,
    deleteDeliveryZone,
    resetDeliveryPricing,
  };
}

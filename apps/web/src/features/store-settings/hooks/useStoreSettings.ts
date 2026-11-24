import {
  DEFAULT_STORE_PROFILE,
  type StoreAssetUploadPurpose,
  type StoreOrderingStatusPatch,
  type StoreProfilePatch,
} from '@menu-kiosk/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogKeys, useCatalogQuery } from '@/features/menu-catalog';
import { handleAdminUnauthorizedError } from '@/shared/lib/admin-session-cache';
import { isApiError } from '@/shared/lib/api-error';
import {
  deleteUnusedAdminStoreAsset,
  patchAdminStoreOrderingStatus,
  patchAdminStoreProfile,
  uploadAdminStoreAsset,
} from '../api/store-settings-api';

function handleAdminStoreMutationError(
  queryClient: ReturnType<typeof useQueryClient>,
  error: unknown,
) {
  if (handleAdminUnauthorizedError(queryClient, error)) {
    return;
  }
  if (isApiError(error) && error.status === 409) {
    void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
  }
}

export function useStoreProfile() {
  const catalogQuery = useCatalogQuery();
  const store = catalogQuery.data?.store ?? DEFAULT_STORE_PROFILE;

  return {
    store,
    hasLoadedStore: Boolean(catalogQuery.data?.store),
    deliveryPricing: catalogQuery.data?.deliveryPricing ?? null,
    catalogQuery,
  };
}

export function useUpdateStoreProfileMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: StoreProfilePatch) => patchAdminStoreProfile(patch),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Saving store settings…',
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
    onError: (error) => handleAdminStoreMutationError(queryClient, error),
  });
}

export function useUpdateStoreOrderingStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: StoreOrderingStatusPatch) => patchAdminStoreOrderingStatus(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
    onError: (error) => handleAdminStoreMutationError(queryClient, error),
  });
}

export function useUploadStoreAssetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { file: File; purpose: StoreAssetUploadPurpose }) =>
      uploadAdminStoreAsset(params),
    meta: {
      blockingBackdrop: true,
      loadingLabel: 'Optimizing and uploading image…',
    },
    onError: (error) => handleAdminStoreMutationError(queryClient, error),
  });
}

export function useDeleteUnusedStoreAssetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageUrl: string) => deleteUnusedAdminStoreAsset(imageUrl),
    onError: (error) => handleAdminStoreMutationError(queryClient, error),
  });
}

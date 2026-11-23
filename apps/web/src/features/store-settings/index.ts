import { lazy } from 'react';

export { ShopSetupChecklist } from './components/ShopSetupChecklist';
export { StoreOrderingStatusToggle } from './components/StoreOrderingStatusToggle';
export const StoreSettingsManager = lazy(() =>
  import('./components/StoreSettingsManager').then((mod) => ({
    default: mod.StoreSettingsManager,
  })),
);
export {
  useDeleteUnusedStoreAssetMutation,
  useStoreProfile,
  useUpdateStoreOrderingStatusMutation,
  useUpdateStoreProfileMutation,
  useUploadStoreAssetMutation,
} from './hooks/useStoreSettings';

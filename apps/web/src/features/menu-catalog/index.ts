import { lazy } from 'react';
import { loadItemCustomizerModal } from './preload';

export const AdminCatalogManager = lazy(() =>
  import('./components/AdminCatalogManager').then((module) => ({
    default: module.AdminCatalogManager,
  })),
);
export { catalogKeys } from './api/catalog-api';
export const ItemCustomizerModal = lazy(() =>
  loadItemCustomizerModal().then((module) => ({
    default: module.ItemCustomizerModal,
  })),
);
export { preloadItemCustomizerModal } from './preload';
export { StorefrontCatalog } from './components/StorefrontCatalog';
export {
  useCatalogQuery,
  useCategoryMutations,
  useDeliveryPricingMutations,
  useMenuMutations,
  useOptionGroupMutations,
} from './hooks/useCatalog';

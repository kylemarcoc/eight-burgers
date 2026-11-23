import { lazy } from 'react';

export const AdminCatalogManager = lazy(() =>
  import('./components/AdminCatalogManager').then((module) => ({
    default: module.AdminCatalogManager,
  })),
);
export { catalogKeys } from './api/catalog-api';
export { ItemCustomizerModal } from './components/ItemCustomizerModal';
export { StorefrontCatalog } from './components/StorefrontCatalog';
export {
  useCatalogQuery,
  useCategoryMutations,
  useDeliveryPricingMutations,
  useMenuMutations,
  useOptionGroupMutations,
} from './hooks/useCatalog';

import { lazy } from 'react';

export const AdminCatalogManager = lazy(() =>
  import('./components/AdminCatalogManager').then((module) => ({
    default: module.AdminCatalogManager,
  })),
);
export { catalogKeys } from './api/catalog-api';
export { StorefrontCatalog } from './components/StorefrontCatalog';
export { useCatalogQuery, useDeliveryPricingMutations, useMenuMutations } from './hooks/useCatalog';

import { lazy } from 'react';

export const AdminCatalogManager = lazy(() =>
  import('./components/AdminCatalogManager').then((module) => ({
    default: module.AdminCatalogManager,
  })),
);
export { StorefrontCatalog } from './components/StorefrontCatalog';

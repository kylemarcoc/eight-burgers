import { lazy } from 'react';
import { loadCartPortalDrawer } from './preload';

export const CartPortalDrawer = lazy(() =>
  loadCartPortalDrawer().then((module) => ({
    default: module.CartPortalDrawer,
  })),
);
export { FloatingCartButton } from './components/FloatingCartButton';
export { useCartLifecycle } from './hooks/useCartLifecycle';
export { useResolvedCartSummary } from './hooks/useResolvedCartSummary';
export { preloadCartPortalDrawer } from './preload';

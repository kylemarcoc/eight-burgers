export function loadCartPortalDrawer() {
  return import('./components/CartPortalDrawer');
}

export function preloadCartPortalDrawer(): void {
  void loadCartPortalDrawer();
}

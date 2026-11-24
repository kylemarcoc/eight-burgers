import {
  DEFAULT_STORE_PROFILE,
  isSafeImageUrl,
  resolveStoreAccentTokens,
} from '@menu-kiosk/contracts';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { useTheme } from '@/app/providers/theme-context';
import {
  CartPortalDrawer,
  FloatingCartButton,
  preloadCartPortalDrawer,
  useCartLifecycle,
  useResolvedCartSummary,
} from '@/features/cart-portal';
import { useCatalogQuery } from '@/features/menu-catalog';
import {
  useCartActions,
  useCartOpen,
  useLastPlacedOrder,
  useTrackedQueueNumber,
} from '@/shared/store/useCartStore';

function escapeSvgText(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMonogramFaviconHref(monogram: string, bgHex: string, fgHex: string): string {
  const safeMonogram = escapeSvgText(monogram.trim().slice(0, 3) || 'MK');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='${bgHex}'/><text x='16' y='21.5' text-anchor='middle' font-family='system-ui,sans-serif' font-size='${safeMonogram.length > 2 ? 12 : 15}' font-weight='700' fill='${fgHex}'>${safeMonogram}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function KioskShell() {
  const { theme, toggleTheme, setStoreAccent } = useTheme();
  const catalogQuery = useCatalogQuery();
  const store = catalogQuery.data?.store ?? DEFAULT_STORE_PROFILE;
  const cartSummary = useResolvedCartSummary();
  const { setCartOpen } = useCartActions();
  const trackedQueueNumber = useTrackedQueueNumber();
  const lastPlacedOrderState = useLastPlacedOrder();
  const activeQueueNumber = trackedQueueNumber ?? lastPlacedOrderState?.order.queueNumber ?? null;
  const totalItems = cartSummary.totalItems;
  const showAdminNav = import.meta.env.VITE_HIDE_PUBLIC_ADMIN !== 'true';
  const isAdminRoute = Boolean(useMatch('/admin/*'));
  const isCartOpen = useCartOpen();
  useCartLifecycle(!isAdminRoute, { suppressLoadingIndicator: !isCartOpen });
  const [failedLogoSrc, setFailedLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    if (isAdminRoute) {
      setCartOpen(false);
    }
  }, [isAdminRoute, setCartOpen]);

  useEffect(() => {
    const loadedStore = catalogQuery.data?.store;
    if (!loadedStore) return;
    setStoreAccent(loadedStore.themeAccentPreset, loadedStore.themeAccentHex);
  }, [catalogQuery.data?.store, setStoreAccent]);

  useEffect(() => {
    const loadedStore = catalogQuery.data?.store;
    if (!loadedStore) return;

    document.title = loadedStore.branchLabel
      ? `${loadedStore.storeName} — ${loadedStore.branchLabel}`
      : loadedStore.storeName;

    let iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      document.head.appendChild(iconLink);
    }

    const safeLogo = loadedStore.logoUrl.trim();
    if (safeLogo && isSafeImageUrl(safeLogo)) {
      iconLink.removeAttribute('type');
      iconLink.href = safeLogo;
    } else {
      const lightTokens = resolveStoreAccentTokens(
        loadedStore.themeAccentPreset,
        loadedStore.themeAccentHex,
      ).light;
      iconLink.type = 'image/svg+xml';
      iconLink.href = buildMonogramFaviconHref(
        loadedStore.monogram,
        lightTokens.accent,
        lightTokens.onAccent,
      );
    }
  }, [catalogQuery.data?.store]);

  const showUploadedLogo = Boolean(store.logoUrl.trim()) && failedLogoSrc !== store.logoUrl;

  return (
    <div className="min-h-screen bg-ui-canvas text-ui-text">
      <header className="sticky top-0 z-30 border-b border-ui-border bg-ui-surface/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <NavLink to="/" className="flex items-center gap-3">
            {showUploadedLogo ? (
              <img
                src={store.logoUrl}
                alt={`${store.storeName} logo`}
                onError={() => setFailedLogoSrc(store.logoUrl)}
                className="h-10 w-10 rounded-xl border border-ui-border bg-ui-surface object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ui-accent text-base font-extrabold text-ui-on-accent">
                {store.monogram}
              </span>
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight text-ui-text">
                {store.storeName}
              </span>
              {store.branchLabel ? (
                <span className="text-xs text-ui-text-muted">{store.branchLabel}</span>
              ) : null}
            </span>
          </NavLink>

          <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-3">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  isActive
                    ? 'bg-ui-accent text-ui-on-accent'
                    : 'text-ui-text hover:bg-ui-surface-muted'
                }`
              }
            >
              Menu
            </NavLink>
            {showAdminNav ? (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none ${
                    isActive
                      ? 'bg-ui-accent text-ui-on-accent'
                      : 'text-ui-text hover:bg-ui-surface-muted'
                  }`
                }
              >
                Staff Portal
              </NavLink>
            ) : null}
            {!isAdminRoute ? (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                onPointerEnter={preloadCartPortalDrawer}
                onFocus={preloadCartPortalDrawer}
                className="hidden rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs font-semibold text-ui-text tabular-nums hover:bg-ui-canvas sm:inline-flex"
              >
                Cart ({totalItems}){activeQueueNumber ? ` · ${activeQueueNumber}` : ''}
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      {!isAdminRoute ? (
        <>
          <FloatingCartButton />
          {isCartOpen ? (
            <Suspense fallback={null}>
              <CartPortalDrawer />
            </Suspense>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

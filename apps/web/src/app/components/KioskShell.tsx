import { useEffect } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router-dom';
import { useTheme } from '@/app/providers/theme-context';
import {
  CartPortalDrawer,
  FloatingCartButton,
  useResolvedCartSummary,
} from '@/features/cart-portal';
import { STORE_METADATA } from '@/shared/shop/eight-burgers-seed';
import {
  useCartActions,
  useLastPlacedOrder,
  useTrackedQueueNumber,
} from '@/shared/store/useCartStore';

export function KioskShell() {
  const { theme, toggleTheme } = useTheme();
  const cartSummary = useResolvedCartSummary();
  const { setCartOpen } = useCartActions();
  const trackedQueueNumber = useTrackedQueueNumber();
  const lastPlacedOrderState = useLastPlacedOrder();
  const activeQueueNumber = trackedQueueNumber ?? lastPlacedOrderState?.order.queueNumber ?? null;
  const totalItems = cartSummary.totalItems;
  const showAdminNav = import.meta.env.VITE_HIDE_PUBLIC_ADMIN !== 'true';
  const isAdminRoute = Boolean(useMatch('/admin/*'));

  useEffect(() => {
    if (isAdminRoute) {
      setCartOpen(false);
    }
  }, [isAdminRoute, setCartOpen]);

  return (
    <div className="min-h-screen bg-ui-canvas text-ui-text">
      <header className="sticky top-0 z-30 border-b border-ui-border bg-ui-surface/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ui-accent text-lg font-extrabold text-ui-on-accent">
              8B
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight text-ui-text">
                {STORE_METADATA.name}
              </span>
              <span className="text-xs text-ui-text-muted">{STORE_METADATA.branch}</span>
            </span>
          </NavLink>

          <nav aria-label="Primary navigation" className="flex items-center gap-2 sm:gap-3">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
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
                  `rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-ui-accent text-ui-on-accent'
                      : 'text-ui-text hover:bg-ui-surface-muted'
                  }`
                }
              >
                Owner Admin
              </NavLink>
            ) : null}
            {!isAdminRoute ? (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
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
          <CartPortalDrawer />
        </>
      ) : null}
    </div>
  );
}

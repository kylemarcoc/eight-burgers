import { formatPhp } from '@/shared/shop/shop-storage';
import { useCartActions, useCartOpen } from '@/shared/store/useCartStore';
import { useResolvedCartSummary } from '../hooks/useResolvedCartSummary';

export function FloatingCartButton() {
  const cartSummary = useResolvedCartSummary();
  const isCartOpen = useCartOpen();
  const { setCartOpen } = useCartActions();

  const label =
    cartSummary.totalItems > 0
      ? `Open cart with ${cartSummary.totalItems} ${
          cartSummary.totalItems === 1 ? 'item' : 'items'
        }, subtotal ${formatPhp(cartSummary.subtotalPhp)}`
      : 'Open cart (empty)';

  return (
    <button
      type="button"
      onClick={() => setCartOpen(!isCartOpen)}
      aria-label={label}
      aria-expanded={isCartOpen}
      className="fixed right-5 bottom-5 z-40 inline-flex items-center gap-3 rounded-2xl border border-ui-border bg-ui-accent px-4 py-3 text-ui-on-accent shadow-lg hover:bg-ui-accent-hover motion-safe:transition-transform motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] sm:right-7 sm:bottom-7"
    >
      <span className="relative inline-flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-5 w-5"
        >
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        {cartSummary.totalItems > 0 ? (
          <span className="absolute -top-2 -right-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-950 px-1 text-[11px] font-bold text-amber-200 tabular-nums">
            {cartSummary.totalItems}
          </span>
        ) : null}
      </span>

      <span className="flex flex-col text-left leading-tight">
        <span className="text-xs font-medium opacity-90">
          {cartSummary.totalItems > 0
            ? `${cartSummary.totalItems} ${cartSummary.totalItems === 1 ? 'item' : 'items'}`
            : 'Cart'}
        </span>
        <span className="text-sm font-bold tabular-nums">
          {cartSummary.totalItems > 0 ? formatPhp(cartSummary.subtotalPhp) : 'View bag'}
        </span>
      </span>
    </button>
  );
}

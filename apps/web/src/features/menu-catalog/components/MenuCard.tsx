import {
  formatPhp,
  getActiveItemOptionGroups,
  getMenuItemDisplayPrice,
  isMenuItemOrderable,
  type MenuItem,
  type OptionGroup,
} from '@menu-kiosk/contracts';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FoodImage } from '@/shared/components/FoodImage';

type MenuCardProps = {
  item: MenuItem;
  optionGroups?: readonly OptionGroup[];
  qtyInCart: number;
  onAddToCart: (itemId: string) => void;
  onOpenCustomizer?: (item: MenuItem) => void;
  onPreloadCustomizer?: () => void;
};

export const MenuCard = memo(function MenuCard({
  item,
  optionGroups = [],
  qtyInCart,
  onAddToCart,
  onOpenCustomizer,
  onPreloadCustomizer,
}: MenuCardProps) {
  const [justAdded, setJustAdded] = useState(false);
  const addedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current !== null) {
        window.clearTimeout(addedTimerRef.current);
      }
    };
  }, []);

  const activeGroups = useMemo(
    () => getActiveItemOptionGroups(item, optionGroups),
    [item, optionGroups],
  );
  const hasOptionGroups = activeGroups.length > 0;
  const orderable = useMemo(() => isMenuItemOrderable(item, optionGroups), [item, optionGroups]);
  const displayPrice = useMemo(
    () => getMenuItemDisplayPrice(item, optionGroups),
    [item, optionGroups],
  );

  const formattedPrice = displayPrice.isFromPrice
    ? `From ${formatPhp(displayPrice.pricePhp)}`
    : formatPhp(displayPrice.pricePhp);

  function handlePrimaryAction() {
    if (!item.available || !orderable) return;
    if (hasOptionGroups && onOpenCustomizer) {
      onOpenCustomizer(item);
      return;
    }
    onAddToCart(item.id);
    setJustAdded(true);
    if (addedTimerRef.current !== null) {
      window.clearTimeout(addedTimerRef.current);
    }
    addedTimerRef.current = window.setTimeout(() => {
      addedTimerRef.current = null;
      setJustAdded(false);
    }, 1100);
  }

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border border-ui-border bg-ui-surface transition-colors motion-reduce:transition-none ${
        item.available && orderable ? 'hover:border-ui-accent/60' : 'opacity-80'
      }`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ui-surface-muted">
        <FoodImage
          src={item.imageUrl}
          alt={item.name}
          badgeText={item.name}
          className="h-full w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {item.specLabel ? (
            <span className="rounded-md bg-stone-950/80 px-2.5 py-1 text-xs font-medium text-amber-100 backdrop-blur-xs">
              {item.specLabel}
            </span>
          ) : (
            <span />
          )}
          {!item.available ? (
            <span className="rounded-md bg-red-900/90 px-2.5 py-1 text-xs font-semibold text-white">
              Sold out
            </span>
          ) : !orderable ? (
            <span className="rounded-md bg-red-900/90 px-2.5 py-1 text-xs font-semibold text-white">
              Options unavailable
            </span>
          ) : item.featured ? (
            <span className="rounded-md bg-ui-accent px-2.5 py-1 text-xs font-semibold text-ui-on-accent">
              House favorite
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg leading-snug font-semibold tracking-tight text-ui-text">
            {item.name}
          </h3>
          <span className="shrink-0 text-lg font-bold text-ui-accent tabular-nums">
            {formattedPrice}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-ui-text-muted">{item.description}</p>

        {!hasOptionGroups && item.available && orderable && onOpenCustomizer ? (
          <div className="mt-auto pt-1">
            <button
              type="button"
              onClick={() => onOpenCustomizer(item)}
              onPointerEnter={onPreloadCustomizer}
              onFocus={onPreloadCustomizer}
              className="text-xs font-medium text-ui-text-muted underline decoration-ui-border underline-offset-4 hover:text-ui-text"
            >
              Customize / Note
            </button>
          </div>
        ) : (
          <div className="mt-auto" />
        )}

        <div className="flex items-center justify-between gap-3 border-t border-ui-border pt-3">
          <div className="text-xs text-ui-text-muted">
            {qtyInCart > 0 ? (
              <span className="inline-flex items-center rounded-md bg-ui-surface-muted px-2 py-1 font-medium text-ui-text tabular-nums">
                {qtyInCart} in cart
              </span>
            ) : (
              <span>{hasOptionGroups ? 'Customizable' : 'Made fresh to order'}</span>
            )}
          </div>

          <button
            type="button"
            disabled={!item.available || !orderable}
            onClick={handlePrimaryAction}
            onPointerEnter={hasOptionGroups && onOpenCustomizer ? onPreloadCustomizer : undefined}
            onFocus={hasOptionGroups && onOpenCustomizer ? onPreloadCustomizer : undefined}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold tabular-nums transition-colors motion-reduce:transition-none ${
              item.available && orderable
                ? 'bg-ui-accent text-ui-on-accent hover:bg-ui-accent-hover'
                : 'cursor-not-allowed bg-ui-surface-muted text-ui-text-muted'
            }`}
          >
            {!item.available
              ? 'Unavailable'
              : !orderable
                ? 'Options unavailable'
                : hasOptionGroups && onOpenCustomizer
                  ? `Customize · ${formattedPrice}`
                  : justAdded
                    ? 'Added to cart'
                    : `Add · ${formattedPrice}`}
          </button>
          <span role="status" className="sr-only">
            {justAdded ? `Added ${item.name} to cart.` : ''}
          </span>
        </div>
      </div>
    </article>
  );
});

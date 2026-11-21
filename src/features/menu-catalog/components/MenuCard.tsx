import { useEffect, useId, useRef, useState } from 'react';
import { FoodImage } from '@/shared/components/FoodImage';
import { MENU_ADDONS } from '@/shared/shop/eight-burgers-seed';
import { formatPhp } from '@/shared/shop/shop-storage';
import type { MenuAddonId, MenuItem } from '@/shared/shop/types';

type MenuCardProps = {
  item: MenuItem;
  qtyInCart: number;
  onAddToCart: (itemId: string, addonIds: MenuAddonId[]) => void;
};

export function MenuCard({ item, qtyInCart, onAddToCart }: MenuCardProps) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<MenuAddonId[]>([]);
  const [justAdded, setJustAdded] = useState(false);
  const addonsPanelId = useId();
  const addedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current !== null) {
        window.clearTimeout(addedTimerRef.current);
      }
    };
  }, []);

  const addonsAllowed = item.allowAddons && item.available;
  const addonsTotalPhp = addonsAllowed
    ? MENU_ADDONS.reduce(
        (sum, addon) => (selectedAddons.includes(addon.id) ? sum + addon.pricePhp : sum),
        0,
      )
    : 0;
  const effectiveUnitPricePhp = item.pricePhp + addonsTotalPhp;

  function toggleAddon(addonId: MenuAddonId) {
    setSelectedAddons((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId],
    );
  }

  function handleAdd() {
    if (!item.available) return;
    onAddToCart(item.id, item.allowAddons ? selectedAddons : []);
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
      className={`group flex flex-col overflow-hidden rounded-2xl border border-ui-border bg-ui-surface transition-colors ${
        item.available ? 'hover:border-ui-accent/60' : 'opacity-80'
      }`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ui-surface-muted">
        <FoodImage
          src={item.imageUrl}
          alt={item.name}
          category={item.category}
          badgeText={item.name}
          className="h-full w-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="rounded-md bg-stone-950/80 px-2.5 py-1 text-xs font-medium text-amber-100 backdrop-blur-xs">
            {item.pattySpec}
          </span>
          {!item.available ? (
            <span className="rounded-md bg-red-900/90 px-2.5 py-1 text-xs font-semibold text-white">
              Sold out
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
            {formatPhp(item.pricePhp)}
          </span>
        </div>

        <p className="text-sm leading-relaxed text-ui-text-muted">{item.description}</p>

        {addonsAllowed ? (
          <div className="mt-auto pt-1">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={customizeOpen}
                aria-controls={addonsPanelId}
                onClick={() => setCustomizeOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ui-text-muted underline decoration-ui-border underline-offset-4 hover:text-ui-text"
              >
                {customizeOpen ? 'Hide add-ons' : 'Customize add-ons'}
                {selectedAddons.length > 0 ? ` (${selectedAddons.length} selected)` : ''}
              </button>
              {customizeOpen && selectedAddons.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedAddons([])}
                  className="text-xs font-medium text-ui-text-muted underline hover:text-ui-text"
                >
                  Clear add-ons
                </button>
              ) : null}
            </div>

            {customizeOpen ? (
              <div
                id={addonsPanelId}
                className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl border border-ui-border bg-ui-surface-muted p-2.5"
              >
                {MENU_ADDONS.map((addon) => {
                  const checked = selectedAddons.includes(addon.id);
                  return (
                    <label
                      key={addon.id}
                      className={`flex cursor-pointer items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                        checked
                          ? 'border-ui-accent bg-ui-surface font-semibold text-ui-text'
                          : 'border-transparent bg-ui-surface/60 text-ui-text-muted hover:bg-ui-surface'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAddon(addon.id)}
                          className="accent-ui-accent h-3.5 w-3.5 rounded"
                        />
                        <span className="truncate">{addon.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">+{formatPhp(addon.pricePhp)}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
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
              <span>Made fresh to order</span>
            )}
          </div>

          <button
            type="button"
            disabled={!item.available}
            onClick={handleAdd}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold tabular-nums transition-colors ${
              item.available
                ? 'bg-ui-accent text-ui-on-accent hover:bg-ui-accent-hover'
                : 'cursor-not-allowed bg-ui-surface-muted text-ui-text-muted'
            }`}
          >
            {!item.available
              ? 'Unavailable'
              : justAdded
                ? 'Added to cart'
                : `Add · ${formatPhp(effectiveUnitPricePhp)}`}
          </button>
          <span role="status" className="sr-only">
            {justAdded ? `Added ${item.name} to cart.` : ''}
          </span>
        </div>
      </div>
    </article>
  );
}

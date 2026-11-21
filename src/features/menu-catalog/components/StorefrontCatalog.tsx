import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FoodImage } from '@/shared/components/FoodImage';
import { MENU_CATEGORIES, STORE_METADATA } from '@/shared/shop/eight-burgers-seed';
import { useShop } from '@/shared/shop/shop-context';
import { formatPhp } from '@/shared/shop/shop-storage';
import type { MenuAddonId, MenuCategory } from '@/shared/shop/types';
import { MenuCard } from './MenuCard';

type CategoryFilter = 'all' | MenuCategory;

const CATEGORY_TABS: readonly { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All menu' },
  ...MENU_CATEGORIES,
];

export function StorefrontCatalog() {
  const { menu, cartSummary, addToCart, setCartOpen } = useShop();
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [heroAnnouncement, setHeroAnnouncement] = useState('');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<Partial<Record<CategoryFilter, HTMLButtonElement | null>>>({});
  const tabPanelId = useId();
  const tabIdPrefix = useId();

  const itemQuantitiesInCart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of cartSummary.lines) {
      counts.set(line.item.id, (counts.get(line.item.id) ?? 0) + line.quantity);
    }
    return counts;
  }, [cartSummary.lines]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryFilter, number>([['all', menu.length]]);
    for (const category of MENU_CATEGORIES) {
      counts.set(category.id, 0);
    }
    for (const item of menu) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return counts;
  }, [menu]);

  const priceRangeLabel = useMemo(() => {
    if (menu.length === 0) return '—';
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const item of menu) {
      if (item.pricePhp < min) min = item.pricePhp;
      if (item.pricePhp > max) max = item.pricePhp;
    }
    if (min === max) return formatPhp(min);
    return `${formatPhp(min)} – ${formatPhp(max)}`;
  }, [menu]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return menu.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (availableOnly && !item.available) return false;
      if (!normalizedQuery) return true;
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.pattySpec.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [menu, selectedCategory, availableOnly, searchQuery]);

  const featuredHighlights = useMemo(
    () => menu.filter((item) => item.featured).slice(0, 3),
    [menu],
  );

  function handleAddToCart(itemId: string, addonIds: MenuAddonId[]) {
    addToCart(itemId, { addonIds });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      targetIndex = (currentIndex + 1) % CATEGORY_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      targetIndex = (currentIndex - 1 + CATEGORY_TABS.length) % CATEGORY_TABS.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = CATEGORY_TABS.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    const targetTab = CATEGORY_TABS[targetIndex];
    if (!targetTab) return;
    setSelectedCategory(targetTab.id);
    tabRefs.current[targetTab.id]?.focus();
  }

  const hasActiveFilter =
    selectedCategory !== 'all' || searchQuery.trim().length > 0 || availableOnly;

  return (
    <div className="space-y-8 pb-24">
      <section className="overflow-hidden rounded-3xl border border-ui-border bg-ui-surface">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="flex flex-col justify-between gap-6 p-6 sm:p-8 lg:col-span-7">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ui-text-muted">
                <span className="rounded-md border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-ui-text">
                  {STORE_METADATA.branch}
                </span>
                <span>{STORE_METADATA.hours}</span>
                <span>·</span>
                <span>{STORE_METADATA.contact}</span>
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-ui-text sm:text-4xl">
                100g pure beef griddle burgers, made fresh on Chino Roces.
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-ui-text-muted">
                Walk up beside Pickup Coffee near Eton WestEnd Square or place an order for Makati
                delivery. Pick your burgers below, customize with cheese, bacon, or pineapple, and
                review your bag from the floating cart button at the bottom right.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 rounded-2xl border border-ui-border bg-ui-surface-muted p-4">
                <div>
                  <p className="text-xs text-ui-text-muted">Patty standard</p>
                  <p className="mt-0.5 text-sm font-semibold text-ui-text">100g Pure Beef</p>
                </div>
                <div>
                  <p className="text-xs text-ui-text-muted">Menu range</p>
                  <p className="mt-0.5 text-sm font-semibold text-ui-text tabular-nums">
                    {priceRangeLabel}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ui-text-muted">Pickup spot</p>
                  <p className="mt-0.5 text-sm font-semibold text-ui-text">Eton WestEnd</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <a
                  href={STORE_METADATA.foodpandaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-ui-border bg-ui-surface px-3.5 py-2 font-medium text-ui-text hover:bg-ui-surface-muted"
                >
                  Foodpanda Listing
                </a>
                <a
                  href={STORE_METADATA.facebookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-ui-border bg-ui-surface px-3.5 py-2 font-medium text-ui-text hover:bg-ui-surface-muted"
                >
                  Facebook Page
                </a>
                {cartSummary.totalItems > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCartOpen(true)}
                    className="inline-flex items-center rounded-lg bg-ui-accent px-4 py-2 font-semibold text-ui-on-accent tabular-nums hover:bg-ui-accent-hover"
                  >
                    Review Order ({cartSummary.totalItems} · {formatPhp(cartSummary.subtotalPhp)})
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between border-t border-ui-border bg-ui-surface-muted lg:col-span-5 lg:border-t-0 lg:border-l">
            <div className="relative aspect-[16/10] w-full flex-1 overflow-hidden lg:aspect-auto">
              <FoodImage
                src={STORE_METADATA.bannerImageUrl}
                alt="8Burgers Chino Roces Avenue signature burger showcase"
                category="classic-burgers"
                badgeText="8Burgers Chino Roces"
                className="h-full w-full"
              />
            </div>

            {featuredHighlights.length > 0 ? (
              <div className="border-t border-ui-border bg-ui-surface p-4">
                <p className="text-xs font-semibold tracking-wide text-ui-text-muted uppercase">
                  Popular on Chino Roces
                </p>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {featuredHighlights.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        handleAddToCart(item.id, []);
                        setHeroAnnouncement(`Added ${item.name} to cart.`);
                      }}
                      disabled={!item.available}
                      aria-label={
                        item.available
                          ? `Quick add ${item.name}, ${formatPhp(item.pricePhp)}`
                          : `${item.name} is sold out`
                      }
                      className="rounded-xl border border-ui-border bg-ui-surface-muted px-2.5 py-2 text-left transition-colors hover:border-ui-accent disabled:opacity-50"
                    >
                      <p className="truncate text-xs font-semibold text-ui-text">{item.name}</p>
                      <p className="mt-0.5 text-xs font-bold text-ui-accent tabular-nums">
                        {item.available ? formatPhp(item.pricePhp) : 'Sold out'}
                      </p>
                    </button>
                  ))}
                </div>
                <p role="status" className="sr-only">
                  {heroAnnouncement}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="menu-heading" className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-ui-border pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="menu-heading" className="text-2xl font-bold tracking-tight text-ui-text">
              Menu
            </h2>
            <p className="mt-1 text-sm text-ui-text-muted">
              {STORE_METADATA.landmark} · Prices include freshly toasted buns and house dressings.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search burgers, salsa, fries..."
                aria-label="Search menu items"
                className="w-full rounded-xl border border-ui-border bg-ui-surface px-3.5 py-2 text-sm text-ui-text placeholder:text-ui-text-muted sm:w-64"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear menu search"
                  className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-2 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ui-text">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(event) => setAvailableOnly(event.target.checked)}
                className="accent-ui-accent h-4 w-4 rounded"
              />
              <span>In stock only</span>
            </label>
          </div>
        </div>

        <div role="tablist" aria-label="Menu categories" className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((category, index) => {
            const active = selectedCategory === category.id;
            const tabId = `${tabIdPrefix}-${category.id}`;
            return (
              <button
                key={category.id}
                ref={(element) => {
                  tabRefs.current[category.id] = element;
                }}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={tabPanelId}
                tabIndex={active ? 0 : -1}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                onClick={() => setSelectedCategory(category.id)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-ui-accent bg-ui-accent text-ui-on-accent'
                    : 'border-ui-border bg-ui-surface text-ui-text hover:bg-ui-surface-muted'
                }`}
              >
                {category.label} ({categoryCounts.get(category.id) ?? 0})
              </button>
            );
          })}
        </div>

        {hasActiveFilter ? (
          <p role="status" className="text-xs text-ui-text-muted tabular-nums">
            Showing {filteredItems.length} of {menu.length} menu{' '}
            {menu.length === 1 ? 'item' : 'items'}
          </p>
        ) : null}

        <div id={tabPanelId} role="tabpanel" aria-labelledby={`${tabIdPrefix}-${selectedCategory}`}>
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-ui-border bg-ui-surface p-8 text-center">
              <p className="text-base font-semibold text-ui-text">
                No menu items match your filter.
              </p>
              <p className="mt-1 text-sm text-ui-text-muted">
                Try clearing your search query or switching back to all categories.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                  setAvailableOnly(false);
                }}
                className="mt-4 rounded-lg border border-ui-border bg-ui-surface-muted px-4 py-2 text-sm font-medium text-ui-text hover:bg-ui-surface"
              >
                Reset menu filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  qtyInCart={itemQuantitiesInCart.get(item.id) ?? 0}
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

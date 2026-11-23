import {
  DEFAULT_STORE_PROFILE,
  getActiveItemOptionGroups,
  getDefaultSelectedOptionIds,
  getMenuItemDisplayPrice,
  isMenuItemOrderable,
  validateItemOptionSelections,
  type MenuItem,
} from '@menu-kiosk/contracts';
import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FoodImage } from '@/shared/components/FoodImage';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { calculateCartDetails, formatPhp } from '@/shared/shop/shop-storage';
import { useCartActions, useCartLines, useDineInTable } from '@/shared/store/useCartStore';
import { useCatalogQuery } from '../hooks/useCatalog';
import { ItemCustomizerModal } from './ItemCustomizerModal';
import { MenuCard } from './MenuCard';

export function StorefrontCatalog() {
  const catalogQuery = useCatalogQuery();
  const store = catalogQuery.data?.store ?? DEFAULT_STORE_PROFILE;
  const isOrderingPaused = catalogQuery.isSuccess && !store.acceptingOrders;
  const menu = useMemo(() => catalogQuery.data?.menu ?? [], [catalogQuery.data?.menu]);
  const categories = useMemo(
    () =>
      [...(catalogQuery.data?.categories ?? [])]
        .filter((category) => category.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [catalogQuery.data?.categories],
  );
  const optionGroups = useMemo(
    () => catalogQuery.data?.optionGroups ?? [],
    [catalogQuery.data?.optionGroups],
  );

  const cartLines = useCartLines();
  const dineInTable = useDineInTable();
  const { addToCart, clearDineInTable, setCartOpen } = useCartActions();

  const cartSummary = useMemo(
    () => calculateCartDetails(cartLines, menu, optionGroups),
    [cartLines, menu, optionGroups],
  );

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [heroAnnouncement, setHeroAnnouncement] = useState('');
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabPanelId = useId();
  const tabIdPrefix = useId();

  const activeCategoryIds = useMemo(
    () => new Set(categories.map((category) => category.id)),
    [categories],
  );

  const effectiveSelectedCategory =
    selectedCategory !== 'all' && !activeCategoryIds.has(selectedCategory)
      ? 'all'
      : selectedCategory;

  const categoryTabs = useMemo(
    () => [
      { id: 'all', label: 'All menu' },
      ...categories.map((category) => ({ id: category.id, label: category.name })),
    ],
    [categories],
  );

  const visibleMenu = useMemo(() => {
    if (categories.length === 0) return menu;
    return menu.filter((item) => activeCategoryIds.has(item.category));
  }, [menu, categories.length, activeCategoryIds]);

  const itemQuantitiesInCart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of cartSummary.lines) {
      counts.set(line.item.id, (counts.get(line.item.id) ?? 0) + line.quantity);
    }
    return counts;
  }, [cartSummary.lines]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>([['all', visibleMenu.length]]);
    for (const category of categories) {
      counts.set(category.id, 0);
    }
    for (const item of visibleMenu) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return counts;
  }, [visibleMenu, categories]);

  const priceRangeLabel = useMemo(() => {
    if (visibleMenu.length === 0) return '—';
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const item of visibleMenu) {
      const display = getMenuItemDisplayPrice(item, optionGroups);
      if (display.pricePhp < min) min = display.pricePhp;
      if (display.pricePhp > max) max = display.pricePhp;
    }
    if (min === max) return formatPhp(min);
    return `${formatPhp(min)} – ${formatPhp(max)}`;
  }, [visibleMenu, optionGroups]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return visibleMenu.filter((item) => {
      if (effectiveSelectedCategory !== 'all' && item.category !== effectiveSelectedCategory) {
        return false;
      }
      if (availableOnly && !isMenuItemOrderable(item, optionGroups)) return false;
      if (!normalizedQuery) return true;
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.specLabel.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [visibleMenu, effectiveSelectedCategory, availableOnly, searchQuery, optionGroups]);

  const featuredHighlights = useMemo(
    () => visibleMenu.filter((item) => item.featured).slice(0, 3),
    [visibleMenu],
  );

  const handleDirectAddToCart = useCallback(
    (itemId: string) => {
      const targetItem = menu.find((item) => item.id === itemId);
      if (!targetItem) return;
      addToCart(targetItem, { selectedOptionIds: [], itemNote: '' });
    },
    [addToCart, menu],
  );

  const handleQuickAddFeatured = useCallback(
    (item: MenuItem) => {
      if (!isMenuItemOrderable(item, optionGroups)) return;
      const activeGroups = getActiveItemOptionGroups(item, optionGroups);
      const hasRequired = activeGroups.some((group) => group.required || group.minSelect > 0);
      if (hasRequired) {
        setCustomizingItem(item);
        return;
      }
      const defaults = getDefaultSelectedOptionIds(item, optionGroups);
      const validation = validateItemOptionSelections(item, defaults, optionGroups);
      if (!validation.valid) {
        setCustomizingItem(item);
        return;
      }
      addToCart(item, { selectedOptionIds: defaults, itemNote: '' });
      setHeroAnnouncement(`Added ${item.name} to cart.`);
    },
    [addToCart, optionGroups],
  );

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      targetIndex = (currentIndex + 1) % categoryTabs.length;
    } else if (event.key === 'ArrowLeft') {
      targetIndex = (currentIndex - 1 + categoryTabs.length) % categoryTabs.length;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = categoryTabs.length - 1;
    }

    if (targetIndex === null) return;
    event.preventDefault();
    const targetTab = categoryTabs[targetIndex];
    if (!targetTab) return;
    setSelectedCategory(targetTab.id);
    tabRefs.current[targetTab.id]?.focus();
  }

  const hasActiveFilter =
    effectiveSelectedCategory !== 'all' || searchQuery.trim().length > 0 || availableOnly;
  const heroTitle = store.heroHeadline || store.storeName;
  const hasHeroImage = Boolean(store.heroImageUrl.trim());
  const pickupLabel = store.pickupSpotLabel || 'Counter Pickup';
  const menuSubtitle = store.landmark || store.address;

  const showDineInBanner = Boolean(dineInTable && (!catalogQuery.isSuccess || store.dineInEnabled));

  return (
    <div className="space-y-8 pb-24">
      {showDineInBanner ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ui-accent/40 bg-ui-surface px-5 py-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-ui-accent px-2 py-0.5 text-xs font-bold text-ui-on-accent">
              Dine-in
            </span>
            <p className="font-semibold text-ui-text">Ordering for Table {dineInTable}</p>
            <span className="text-xs text-ui-text-muted">
              Your table number will be prefilled at checkout.
            </span>
          </div>
          <button
            type="button"
            onClick={() => clearDineInTable()}
            className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {isOrderingPaused ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-ui-error/40 bg-ui-surface px-5 py-4 text-sm"
        >
          <p className="font-bold text-ui-error">Ordering is currently paused</p>
          <p className="mt-1 text-ui-text-muted">
            {store.closedNotice ||
              'You can still browse the menu and prepare your bag. Placing orders will resume shortly.'}
          </p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-ui-border bg-ui-surface">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="flex flex-col justify-between gap-6 p-6 sm:p-8 lg:col-span-7">
            <div className="space-y-4">
              {store.branchLabel || store.hoursText || store.contactPhone ? (
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ui-text-muted">
                  {store.branchLabel ? (
                    <span className="rounded-md border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-ui-text">
                      {store.branchLabel}
                    </span>
                  ) : null}
                  {store.hoursText ? <span>{store.hoursText}</span> : null}
                  {store.hoursText && store.contactPhone ? <span aria-hidden="true">·</span> : null}
                  {store.contactPhone ? <span>{store.contactPhone}</span> : null}
                </div>
              ) : null}

              <h1 className="text-3xl font-bold tracking-tight text-ui-text sm:text-4xl">
                {heroTitle}
              </h1>

              {store.heroSubtext ? (
                <p className="max-w-xl text-base leading-relaxed text-ui-text-muted">
                  {store.heroSubtext}
                </p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div
                className={`grid gap-3 rounded-2xl border border-ui-border bg-ui-surface-muted p-4 ${
                  store.heroBadgeLabel ? 'grid-cols-3' : 'grid-cols-2'
                }`}
              >
                {store.heroBadgeLabel ? (
                  <div>
                    <p className="text-xs text-ui-text-muted">Specialty</p>
                    <p className="mt-0.5 text-sm font-semibold text-ui-text">
                      {store.heroBadgeLabel}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-ui-text-muted">Menu range</p>
                  <p className="mt-0.5 text-sm font-semibold text-ui-text tabular-nums">
                    {priceRangeLabel}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ui-text-muted">Pickup spot</p>
                  <p className="mt-0.5 text-sm font-semibold text-ui-text">{pickupLabel}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {cartSummary.totalItems > 0 ? (
                    <button
                      type="button"
                      onClick={() => setCartOpen(true)}
                      className="inline-flex items-center rounded-xl bg-ui-accent px-4 py-2.5 font-semibold text-ui-on-accent tabular-nums hover:bg-ui-accent-hover"
                    >
                      Review Order ({cartSummary.totalItems} · {formatPhp(cartSummary.subtotalPhp)})
                    </button>
                  ) : (
                    <a
                      href="#menu-heading"
                      className="inline-flex items-center rounded-xl bg-ui-accent px-4 py-2.5 font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
                    >
                      Order from Menu
                    </a>
                  )}
                </div>

                {store.externalLinks.length > 0 ? (
                  <p className="text-xs text-ui-text-muted">
                    Also on{' '}
                    {store.externalLinks.map((link, index) => (
                      <span key={`${link.label}-${link.url}`}>
                        {index > 0 ? ' · ' : ''}
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-ui-border underline-offset-4 hover:text-ui-text"
                        >
                          {link.label}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between border-t border-ui-border bg-ui-surface-muted lg:col-span-5 lg:border-t-0 lg:border-l">
            {hasHeroImage ? (
              <div className="relative aspect-[16/10] w-full flex-1 overflow-hidden lg:aspect-auto lg:min-h-[260px]">
                <FoodImage
                  src={store.heroImageUrl}
                  alt={`${store.storeName}${store.branchLabel ? ` ${store.branchLabel}` : ''} showcase`}
                  badgeText={store.storeName}
                  loading="eager"
                  fetchPriority="high"
                  className="h-full w-full"
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-center gap-3 p-6 sm:p-8 lg:min-h-[260px]">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ui-accent text-lg font-extrabold text-ui-on-accent">
                    {store.monogram}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold tracking-tight text-ui-text">
                      {store.storeName}
                    </p>
                    {store.branchLabel ? (
                      <p className="truncate text-xs text-ui-text-muted">{store.branchLabel}</p>
                    ) : null}
                  </div>
                </div>
                {store.address ? (
                  <p className="text-sm leading-relaxed text-ui-text-muted">{store.address}</p>
                ) : null}
                {store.hoursText ? (
                  <p className="text-xs font-medium text-ui-text-muted">{store.hoursText}</p>
                ) : null}
              </div>
            )}

            {featuredHighlights.length > 0 ? (
              <div className="border-t border-ui-border bg-ui-surface p-4">
                <p className="text-xs font-semibold tracking-wide text-ui-text-muted uppercase">
                  Popular items
                </p>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {featuredHighlights.map((item) => {
                    const orderable = isMenuItemOrderable(item, optionGroups);
                    const display = getMenuItemDisplayPrice(item, optionGroups);
                    const priceText = display.isFromPrice
                      ? `From ${formatPhp(display.pricePhp)}`
                      : formatPhp(display.pricePhp);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleQuickAddFeatured(item)}
                        disabled={!orderable}
                        aria-label={
                          orderable
                            ? `Quick add ${item.name}, ${priceText}`
                            : `${item.name} is sold out`
                        }
                        className="rounded-xl border border-ui-border bg-ui-surface-muted px-2.5 py-2 text-left transition-colors motion-reduce:transition-none hover:border-ui-accent disabled:opacity-50"
                      >
                        <p className="truncate text-xs font-semibold text-ui-text">{item.name}</p>
                        <p className="mt-0.5 text-xs font-bold text-ui-accent tabular-nums">
                          {orderable ? priceText : 'Sold out'}
                        </p>
                      </button>
                    );
                  })}
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
            {menuSubtitle ? (
              <p className="mt-1 text-sm text-ui-text-muted">{menuSubtitle}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search menu items..."
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
          {categoryTabs.map((category, index) => {
            const active = effectiveSelectedCategory === category.id;
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
                className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors motion-reduce:transition-none ${
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

        {hasActiveFilter && catalogQuery.isSuccess ? (
          <p role="status" className="text-xs text-ui-text-muted tabular-nums">
            Showing {filteredItems.length} of {visibleMenu.length} menu{' '}
            {visibleMenu.length === 1 ? 'item' : 'items'}
          </p>
        ) : null}

        <div
          id={tabPanelId}
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-${effectiveSelectedCategory}`}
        >
          {catalogQuery.isPending ? (
            <div role="status" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className="h-72 rounded-2xl border border-ui-border bg-ui-surface p-4"
                >
                  <div className="h-36 w-full rounded-xl bg-ui-surface-muted" />
                  <div className="mt-4 h-5 w-2/3 rounded bg-ui-surface-muted" />
                  <div className="mt-2 h-4 w-full rounded bg-ui-surface-muted" />
                </div>
              ))}
              <span className="sr-only">Loading menu…</span>
            </div>
          ) : catalogQuery.isError ? (
            <div
              role="alert"
              className="rounded-2xl border border-ui-error/40 bg-ui-surface p-8 text-center"
            >
              <p className="text-base font-semibold text-ui-text">
                Unable to load the live menu right now.
              </p>
              <p className="mt-1 text-sm text-ui-text-muted">
                {getApiErrorMessage(
                  catalogQuery.error,
                  'Check that the local backend and Supabase database are running.',
                )}
              </p>
              <button
                type="button"
                onClick={() => void catalogQuery.refetch()}
                className="mt-4 rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
              >
                Retry loading menu
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-ui-border bg-ui-surface p-8 text-center">
              <p className="text-base font-semibold text-ui-text">
                {visibleMenu.length === 0
                  ? 'No menu items are currently listed.'
                  : 'No menu items match your filter.'}
              </p>
              <p className="mt-1 text-sm text-ui-text-muted">
                {visibleMenu.length === 0
                  ? 'Check back shortly as the kitchen updates today’s menu.'
                  : 'Try clearing your search query or switching back to all categories.'}
              </p>
              {visibleMenu.length > 0 ? (
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
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  optionGroups={optionGroups}
                  qtyInCart={itemQuantitiesInCart.get(item.id) ?? 0}
                  onAddToCart={handleDirectAddToCart}
                  onOpenCustomizer={setCustomizingItem}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {customizingItem ? (
        <ItemCustomizerModal
          item={customizingItem}
          optionGroups={optionGroups}
          onConfirm={(selection) => {
            addToCart(customizingItem, selection);
            setHeroAnnouncement(`Added ${customizingItem.name} to cart.`);
            setCustomizingItem(null);
          }}
          onClose={() => setCustomizingItem(null)}
        />
      ) : null}
    </div>
  );
}

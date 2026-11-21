import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { FoodImage } from '@/shared/components/FoodImage';
import { IMAGE_PRESETS, MENU_CATEGORIES } from '@/shared/shop/eight-burgers-seed';
import { useShop } from '@/shared/shop/shop-context';
import { formatPhp } from '@/shared/shop/shop-storage';
import type { MenuCategory, MenuItem, MenuItemInput, OrderStatus } from '@/shared/shop/types';

type FormState = {
  name: string;
  category: MenuCategory;
  pricePhp: string;
  pattySpec: string;
  description: string;
  imageUrl: string;
  available: boolean;
  featured: boolean;
  allowAddons: boolean;
};

type FormFieldErrors = {
  name?: string;
  pricePhp?: string;
  description?: string;
  imageUrl?: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  category: 'classic-burgers',
  pricePhp: '158',
  pattySpec: '100g Pure Beef',
  description: '',
  imageUrl: IMAGE_PRESETS[0]?.url ?? '',
  available: true,
  featured: false,
  allowAddons: true,
};

const ORDER_STATUS_OPTIONS: readonly { value: OrderStatus; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'grilling', label: 'On the Grill' },
  { value: 'ready', label: 'Ready for Pickup / Dispatch' },
  { value: 'completed', label: 'Completed' },
];

const ORDER_STATUS_LABELS = new Map<OrderStatus, string>(
  ORDER_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

const CATEGORY_LABELS = new Map<MenuCategory, string>(
  MENU_CATEGORIES.map((category) => [category.id, category.label]),
);

function itemToFormState(item: MenuItem): FormState {
  return {
    name: item.name,
    category: item.category,
    pricePhp: String(item.pricePhp),
    pattySpec: item.pattySpec,
    description: item.description,
    imageUrl: item.imageUrl,
    available: item.available,
    featured: item.featured,
    allowAddons: item.allowAddons,
  };
}

function isSafeImageUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatOrderTimestamp(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

export function AdminCatalogManager() {
  const {
    menu,
    orders,
    createMenuItem,
    updateMenuItem,
    toggleItemAvailability,
    deleteMenuItem,
    resetCatalog,
    updateOrderStatus,
  } = useShop();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormFieldErrors>({});
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState<'all' | MenuCategory>('all');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const nameErrorId = useId();
  const priceErrorId = useId();
  const descriptionErrorId = useId();
  const imageErrorId = useId();

  const stats = useMemo(() => {
    const inStock = menu.filter((item) => item.available).length;
    return {
      total: menu.length,
      inStock,
      soldOut: menu.length - inStock,
      ordersCount: orders.length,
    };
  }, [menu, orders]);

  const filteredMenu = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    return menu.filter((item) => {
      if (inventoryCategory !== 'all' && item.category !== inventoryCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.pattySpec.toLowerCase().includes(q)
      );
    });
  }, [menu, inventorySearch, inventoryCategory]);

  function startEditing(item: MenuItem) {
    setEditingId(item.id);
    setForm(itemToFormState(item));
    setFormErrors({});
    setConfirmDeleteId(null);
    setStatusBanner(null);
    nameInputRef.current?.focus();
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = form.name.trim();
    const parsedPrice = Number(form.pricePhp);
    const trimmedDescription = form.description.trim();
    const trimmedImageUrl = form.imageUrl.trim();

    const nextErrors: FormFieldErrors = {};
    if (!trimmedName) {
      nextErrors.name = 'Enter an item name before saving.';
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      nextErrors.pricePhp = 'Enter a valid price in pesos greater than 0.';
    }
    if (!trimmedDescription) {
      nextErrors.description = 'Enter ingredients or a short description for customers.';
    }
    if (!isSafeImageUrl(trimmedImageUrl)) {
      nextErrors.imageUrl = 'Enter a valid http:// or https:// image URL, or leave blank.';
    }

    if (nextErrors.name || nextErrors.pricePhp || nextErrors.description || nextErrors.imageUrl) {
      setFormErrors(nextErrors);
      if (nextErrors.name) {
        nameInputRef.current?.focus();
      } else if (nextErrors.pricePhp) {
        priceInputRef.current?.focus();
      } else if (nextErrors.description) {
        descriptionInputRef.current?.focus();
      } else if (nextErrors.imageUrl) {
        imageInputRef.current?.focus();
      }
      return;
    }

    const payload: MenuItemInput = {
      name: trimmedName,
      category: form.category,
      pricePhp: Math.round(parsedPrice),
      pattySpec: form.pattySpec.trim() || '100g Pure Beef',
      description: trimmedDescription,
      imageUrl: trimmedImageUrl,
      available: form.available,
      featured: form.featured,
      allowAddons: form.allowAddons,
    };

    if (editingId) {
      updateMenuItem(editingId, payload);
      setStatusBanner(`Updated "${trimmedName}" (${formatPhp(payload.pricePhp)}).`);
      setEditingId(null);
    } else {
      createMenuItem(payload);
      setStatusBanner(`Added "${trimmedName}" (${formatPhp(payload.pricePhp)}) to the menu.`);
    }

    setFormErrors({});
    setForm(EMPTY_FORM);
  }

  return (
    <div className="space-y-8 pb-24">
      <section className="flex flex-col gap-4 border-b border-ui-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ui-text">
            Owner Menu & Order Manager
          </h1>
          <p className="mt-1 text-sm text-ui-text-muted">
            Add new burgers, paste updated Foodpanda or Facebook photo URLs, toggle sold-out items,
            and track incoming orders. Changes save immediately to browser storage.
          </p>
        </div>

        {confirmReset ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetCatalog();
                cancelEditing();
                setConfirmReset(false);
                setConfirmDeleteId(null);
                setStatusBanner('Restored the default 8Burgers Chino Roces menu.');
              }}
              className="rounded-xl bg-ui-error px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Confirm restore
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded-xl border border-ui-border bg-ui-surface px-4 py-2 text-sm font-medium text-ui-text hover:bg-ui-surface-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="shrink-0 rounded-xl border border-ui-border bg-ui-surface px-4 py-2 text-sm font-medium text-ui-text hover:bg-ui-surface-muted"
          >
            Restore Default Menu
          </button>
        )}
      </section>

      <section aria-label="Store metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">Total listings</p>
          <p className="mt-1 text-2xl font-bold text-ui-text tabular-nums">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">In stock</p>
          <p className="mt-1 text-2xl font-bold text-ui-accent tabular-nums">{stats.inStock}</p>
        </div>
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">Sold out</p>
          <p className="mt-1 text-2xl font-bold text-ui-text tabular-nums">{stats.soldOut}</p>
        </div>
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-4">
          <p className="text-xs text-ui-text-muted">Orders placed</p>
          <p className="mt-1 text-2xl font-bold text-ui-text tabular-nums">{stats.ordersCount}</p>
        </div>
      </section>

      {statusBanner ? (
        <div
          role="status"
          className="flex items-center justify-between gap-4 rounded-xl border border-ui-accent/40 bg-ui-surface px-4 py-3 text-sm font-medium text-ui-text"
        >
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs text-ui-text-muted underline hover:text-ui-text"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section
          aria-labelledby="listing-form-heading"
          className="rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-5"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ui-border pb-3">
            <h2 id="listing-form-heading" className="text-lg font-bold text-ui-text">
              {editingId ? 'Edit menu listing' : 'Add new menu item'}
            </h2>
            {editingId ? (
              <button
                type="button"
                onClick={cancelEditing}
                className="text-xs font-medium text-ui-text-muted underline hover:text-ui-text"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="admin-item-name" className="block text-xs font-semibold text-ui-text">
                Item Name
              </label>
              <input
                ref={nameInputRef}
                id="admin-item-name"
                type="text"
                value={form.name}
                aria-invalid={Boolean(formErrors.name)}
                aria-describedby={formErrors.name ? nameErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, name: value }));
                  if (formErrors.name && value.trim()) {
                    setFormErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                placeholder="e.g. Chino Roces Double Smash"
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                  formErrors.name ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {formErrors.name ? (
                <p
                  id={nameErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {formErrors.name}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="admin-item-category"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Category
                </label>
                <select
                  id="admin-item-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      category: event.target.value as MenuCategory,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
                >
                  {MENU_CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="admin-item-price"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Price (₱)
                </label>
                <input
                  ref={priceInputRef}
                  id="admin-item-price"
                  type="number"
                  min={1}
                  step={1}
                  value={form.pricePhp}
                  aria-invalid={Boolean(formErrors.pricePhp)}
                  aria-describedby={formErrors.pricePhp ? priceErrorId : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((prev) => ({ ...prev, pricePhp: value }));
                    const numeric = Number(value);
                    if (formErrors.pricePhp && Number.isFinite(numeric) && numeric > 0) {
                      setFormErrors((prev) => ({ ...prev, pricePhp: undefined }));
                    }
                  }}
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                    formErrors.pricePhp ? 'border-ui-error' : 'border-ui-border'
                  }`}
                />
                {formErrors.pricePhp ? (
                  <p
                    id={priceErrorId}
                    role="alert"
                    className="mt-1 text-xs font-semibold text-ui-error"
                  >
                    {formErrors.pricePhp}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label htmlFor="admin-item-spec" className="block text-xs font-semibold text-ui-text">
                Patty / Portion Spec
              </label>
              <input
                id="admin-item-spec"
                type="text"
                value={form.pattySpec}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, pattySpec: event.target.value }))
                }
                placeholder="e.g. 100g Pure Beef"
                className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              />
            </div>

            <div>
              <label
                htmlFor="admin-item-description"
                className="block text-xs font-semibold text-ui-text"
              >
                Ingredients & Description
              </label>
              <textarea
                ref={descriptionInputRef}
                id="admin-item-description"
                rows={3}
                value={form.description}
                aria-invalid={Boolean(formErrors.description)}
                aria-describedby={formErrors.description ? descriptionErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, description: value }));
                  if (formErrors.description && value.trim()) {
                    setFormErrors((prev) => ({ ...prev, description: undefined }));
                  }
                }}
                placeholder="Describe patty, cheeses, veggies, and sauces..."
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                  formErrors.description ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {formErrors.description ? (
                <p
                  id={descriptionErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {formErrors.description}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="admin-item-image"
                className="block text-xs font-semibold text-ui-text"
              >
                Image URL (Foodpanda / Facebook / Direct Image)
              </label>
              <input
                ref={imageInputRef}
                id="admin-item-image"
                type="url"
                value={form.imageUrl}
                aria-invalid={Boolean(formErrors.imageUrl)}
                aria-describedby={formErrors.imageUrl ? imageErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, imageUrl: value }));
                  if (formErrors.imageUrl && isSafeImageUrl(value)) {
                    setFormErrors((prev) => ({ ...prev, imageUrl: undefined }));
                  }
                }}
                placeholder="https://images.deliveryhero.io/..."
                className={`w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                  formErrors.imageUrl ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {formErrors.imageUrl ? (
                <p id={imageErrorId} role="alert" className="text-xs font-semibold text-ui-error">
                  {formErrors.imageUrl}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {IMAGE_PRESETS.slice(0, 4).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, imageUrl: preset.url }));
                      setFormErrors((prev) => ({ ...prev, imageUrl: undefined }));
                    }}
                    className="rounded-md border border-ui-border bg-ui-surface-muted px-2 py-1 text-xs text-ui-text-muted hover:text-ui-text"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-ui-border bg-ui-surface-muted">
                <div className="aspect-[16/9] w-full">
                  <FoodImage
                    src={form.imageUrl}
                    alt={form.name || 'Menu item preview'}
                    category={form.category}
                    badgeText={form.name || 'Preview'}
                    className="h-full w-full"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 rounded-xl border border-ui-border bg-ui-surface-muted p-3 text-xs text-ui-text sm:grid-cols-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.available}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, available: event.target.checked }))
                  }
                  className="accent-ui-accent h-4 w-4 rounded"
                />
                <span>In stock</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, featured: event.target.checked }))
                  }
                  className="accent-ui-accent h-4 w-4 rounded"
                />
                <span>Featured</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.allowAddons}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, allowAddons: event.target.checked }))
                  }
                  className="accent-ui-accent h-4 w-4 rounded"
                />
                <span>Allow add-ons</span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
            >
              {editingId ? 'Save Listing Changes' : 'Add Item to Menu'}
            </button>
          </form>
        </section>

        <section aria-labelledby="inventory-heading" className="space-y-4 lg:col-span-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="inventory-heading" className="text-lg font-bold text-ui-text">
              Menu Listings ({filteredMenu.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                value={inventorySearch}
                onChange={(event) => setInventorySearch(event.target.value)}
                placeholder="Filter listings..."
                aria-label="Filter menu listings"
                className="rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-sm text-ui-text"
              />
              <select
                aria-label="Filter listings by category"
                value={inventoryCategory}
                onChange={(event) =>
                  setInventoryCategory(event.target.value as 'all' | MenuCategory)
                }
                className="rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-sm text-ui-text"
              >
                <option value="all">All categories</option>
                {MENU_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredMenu.length === 0 ? (
            <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-center">
              <p className="text-sm font-semibold text-ui-text">
                {menu.length === 0
                  ? 'No menu listings yet.'
                  : 'No listings match your current filter.'}
              </p>
              {menu.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setInventorySearch('');
                    setInventoryCategory('all');
                  }}
                  className="mt-3 rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface"
                >
                  Reset listing filters
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMenu.map((item) => {
                const isEditingItem = editingId === item.id;
                const isConfirmingDelete = confirmDeleteId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col gap-3 rounded-2xl border bg-ui-surface p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                      isEditingItem ? 'border-ui-accent' : 'border-ui-border'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl border border-ui-border bg-ui-surface-muted">
                        <FoodImage
                          src={item.imageUrl}
                          alt={item.name}
                          category={item.category}
                          badgeText={item.name}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-ui-text">
                            {item.name}
                          </h3>
                          <span className="rounded-md bg-ui-surface-muted px-2 py-0.5 text-xs text-ui-text-muted">
                            {CATEGORY_LABELS.get(item.category) ?? item.category}
                          </span>
                          {isEditingItem ? (
                            <span className="rounded-md bg-ui-accent px-2 py-0.5 text-xs font-semibold text-ui-on-accent">
                              Editing
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-ui-text-muted">
                          {item.pattySpec} ·{' '}
                          <span className="font-bold text-ui-accent tabular-nums">
                            {formatPhp(item.pricePhp)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleItemAvailability(item.id)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          item.available
                            ? 'border-ui-border bg-ui-surface-muted text-ui-text hover:bg-ui-canvas'
                            : 'border-red-500/40 bg-red-500/10 text-ui-error'
                        }`}
                      >
                        {item.available ? 'In Stock' : 'Sold Out'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditing(item)}
                        className="rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
                      >
                        Edit
                      </button>
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Confirm delete ${item.name}`}
                            onClick={() => {
                              deleteMenuItem(item.id);
                              if (editingId === item.id) cancelEditing();
                              setConfirmDeleteId(null);
                              setStatusBanner(`Removed "${item.name}" from menu.`);
                            }}
                            className="rounded-lg bg-ui-error px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                          >
                            Confirm delete
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancel delete ${item.name}`}
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete ${item.name}`}
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-error hover:bg-ui-surface-muted"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="orders-ledger-heading" className="space-y-4">
        <h2 id="orders-ledger-heading" className="text-lg font-bold text-ui-text">
          Recent Customer Orders ({orders.length})
        </h2>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-sm text-ui-text-muted">
            No orders placed yet. Add items from the Menu page and complete checkout via the
            bottom-right cart icon to see incoming orders here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {orders.map((order) => {
              const formattedTime = formatOrderTimestamp(order.createdAtIso);
              return (
                <article
                  key={order.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-ui-border bg-ui-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-ui-border pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-ui-accent px-2 py-0.5 text-xs font-bold text-ui-on-accent tabular-nums">
                          {order.queueNumber}
                        </span>
                        <h3 className="text-sm font-semibold text-ui-text">{order.customerName}</h3>
                      </div>
                      <p className="mt-1 text-xs text-ui-text-muted">
                        {order.fulfillment === 'kiosk-pickup' ? 'Kiosk Pickup' : 'Makati Delivery'}{' '}
                        · {order.paymentMethod.toUpperCase()}
                        {order.contactNumber ? ` · ${order.contactNumber}` : ''}
                        {formattedTime ? ` · ${formattedTime}` : ''}
                      </p>
                    </div>

                    <select
                      aria-label={`Order status for ${order.queueNumber}`}
                      value={order.status}
                      onChange={(event) => {
                        const nextStatus = event.target.value as OrderStatus;
                        updateOrderStatus(order.id, nextStatus);
                        const label = ORDER_STATUS_LABELS.get(nextStatus) ?? nextStatus;
                        setStatusBanner(`Updated ${order.queueNumber} status to ${label}.`);
                      }}
                      className="rounded-lg border border-ui-border bg-ui-canvas px-2.5 py-1 text-xs font-medium text-ui-text"
                    >
                      {ORDER_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <ul className="space-y-1.5 text-xs text-ui-text">
                    {order.lines.map((line) => (
                      <li key={line.lineId} className="flex items-start justify-between gap-2">
                        <span>
                          <span className="font-semibold tabular-nums">{line.quantity}×</span>{' '}
                          {line.name}
                          {line.addonNames.length > 0 ? (
                            <span className="text-ui-text-muted">
                              {' '}
                              (+{line.addonNames.join(', ')})
                            </span>
                          ) : null}
                        </span>
                        <span className="font-medium tabular-nums">
                          {formatPhp(line.lineTotalPhp)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {order.addressOrNotes ? (
                    <p className="rounded-lg bg-ui-surface-muted px-2.5 py-1.5 text-xs text-ui-text-muted">
                      Note: {order.addressOrNotes}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between border-t border-ui-border pt-2.5 text-sm font-bold text-ui-text tabular-nums">
                    <span>Total</span>
                    <span className="text-ui-accent">{formatPhp(order.totalPhp)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

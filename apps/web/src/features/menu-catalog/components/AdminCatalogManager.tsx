import {
  MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES,
  MENU_IMAGE_MAX_UPLOAD_BYTES,
  getAdminPermissions,
  type AdminRole,
  type UploadedMenuImage,
} from '@eight-burgers/contracts';
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { FoodImage } from '@/shared/components/FoodImage';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { IMAGE_PRESETS, MENU_CATEGORIES } from '@/shared/shop/eight-burgers-seed';
import { formatPhp, isSafeImageUrl } from '@/shared/shop/shop-storage';
import type { MenuCategory, MenuItem, MenuItemInput } from '@/shared/shop/types';
import { useCatalogQuery, useMenuMutations } from '../hooks/useCatalog';
import { AdminDeliverySettings } from './AdminDeliverySettings';

type StatusBanner = {
  tone: 'success' | 'error';
  message: string;
};

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

const ALLOWED_IMAGE_MIME_SET = new Set<string>(MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES);

function formatKilobytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type AdminCatalogManagerProps = {
  role?: AdminRole;
};

export function AdminCatalogManager({ role = 'owner' }: AdminCatalogManagerProps) {
  const { canManageCatalog, canManageDelivery } = getAdminPermissions(role);
  const catalogQuery = useCatalogQuery();
  const {
    createMenuItem,
    updateMenuItem,
    setItemAvailability,
    deleteMenuItem,
    resetCatalog,
    uploadMenuImage,
    deleteUnusedMenuImage,
  } = useMenuMutations();

  const menu = useMemo(() => catalogQuery.data?.menu ?? [], [catalogQuery.data?.menu]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | undefined>(undefined);
  const [editConflict, setEditConflict] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<FormFieldErrors>({});
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState<'all' | MenuCategory>('all');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingUploadedUrl, setPendingUploadedUrl] = useState<string | null>(null);
  const [uploadedImageMeta, setUploadedImageMeta] = useState<Pick<
    UploadedMenuImage,
    'sizeBytes' | 'width' | 'height'
  > | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cleanupPendingUpload = useCallback(
    (urlToCleanup: string | null) => {
      if (!urlToCleanup) return;
      deleteUnusedMenuImage.mutate(urlToCleanup);
    },
    [deleteUnusedMenuImage],
  );

  const showStatus = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setStatusBanner({ tone, message });
  }, []);

  const setItemPending = useCallback((id: string, pending: boolean) => {
    setPendingItemIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const editingItem = useMemo(
    () => (editingId ? (menu.find((item) => item.id === editingId) ?? null) : null),
    [editingId, menu],
  );
  const isEditingMissing = Boolean(editingId && catalogQuery.isSuccess && !editingItem);

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
    };
  }, [menu]);

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
    cleanupPendingUpload(pendingUploadedUrl);
    setPendingUploadedUrl(null);
    setUploadedImageMeta(null);
    setUploadError(null);
    setEditingId(item.id);
    setEditingVersion(item.version);
    setEditConflict(false);
    setForm(itemToFormState(item));
    setFormErrors({});
    setConfirmDeleteId(null);
    setStatusBanner(null);
    nameInputRef.current?.focus();
  }

  function cancelEditing() {
    cleanupPendingUpload(pendingUploadedUrl);
    setPendingUploadedUrl(null);
    setUploadedImageMeta(null);
    setUploadError(null);
    setEditingId(null);
    setEditingVersion(undefined);
    setEditConflict(false);
    setForm(EMPTY_FORM);
    setFormErrors({});
  }

  async function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.type && !ALLOWED_IMAGE_MIME_SET.has(file.type)) {
      setUploadError('Please select a JPG, PNG, WebP, or AVIF image file.');
      return;
    }

    if (file.size === 0) {
      setUploadError('Selected image file is empty.');
      return;
    }

    if (file.size > MENU_IMAGE_MAX_UPLOAD_BYTES) {
      setUploadError('Image must be 5 MB or smaller.');
      return;
    }

    setUploadError(null);
    const previousUnsavedUrl = pendingUploadedUrl;
    try {
      const uploaded = await uploadMenuImage.mutateAsync(file);
      if (previousUnsavedUrl && previousUnsavedUrl !== uploaded.imageUrl) {
        cleanupPendingUpload(previousUnsavedUrl);
      }
      setPendingUploadedUrl(uploaded.imageUrl);
      setUploadedImageMeta({
        sizeBytes: uploaded.sizeBytes,
        width: uploaded.width,
        height: uploaded.height,
      });
      setForm((prev) => ({ ...prev, imageUrl: uploaded.imageUrl }));
      setFormErrors((prev) => ({ ...prev, imageUrl: undefined }));
      showStatus(
        `Optimized photo to WebP (${formatKilobytes(uploaded.sizeBytes)}, ${uploaded.width}×${uploaded.height}). Save the listing to apply it.`,
      );
    } catch (error) {
      setUploadError(getApiErrorMessage(error, 'Unable to upload photo right now.'));
    }
  }

  async function reloadLatestEditingItem() {
    if (!editingId) return;
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.menu.find((item) => item.id === editingId) ?? editingItem;
    if (!latest) {
      showStatus('This menu item no longer exists in the catalog.', 'error');
      return;
    }
    setForm(itemToFormState(latest));
    setEditingVersion(latest.version);
    setEditConflict(false);
    setFormErrors({});
    showStatus(`Reloaded latest details for "${latest.name}".`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = form.name.trim();
    const parsedPrice = Number(form.pricePhp);
    const trimmedDescription = form.description.trim();
    const trimmedImageUrl = form.imageUrl.trim();

    const nextErrors: FormFieldErrors = {};
    if (!trimmedName) {
      nextErrors.name = 'Enter an item name before saving.';
    } else if (trimmedName.length > 120) {
      nextErrors.name = 'Item name must be 120 characters or fewer.';
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0 || parsedPrice > 100000) {
      nextErrors.pricePhp = 'Enter a valid price between ₱1 and ₱100,000.';
    }
    if (!trimmedDescription) {
      nextErrors.description = 'Enter ingredients or a short description for customers.';
    } else if (trimmedDescription.length > 500) {
      nextErrors.description = 'Description must be 500 characters or fewer.';
    }
    if (!isSafeImageUrl(trimmedImageUrl) || trimmedImageUrl.length > 500) {
      nextErrors.imageUrl = 'Enter a valid https:// image URL (max 500 chars), or leave blank.';
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
      pattySpec: form.pattySpec.trim().slice(0, 80) || '100g Pure Beef',
      description: trimmedDescription,
      imageUrl: trimmedImageUrl,
      available: form.available,
      featured: form.featured,
      allowAddons: form.allowAddons,
    };

    try {
      if (editingId) {
        await updateMenuItem.mutateAsync({
          id: editingId,
          input: payload,
          expectedVersion: editingVersion,
        });
        showStatus(`Updated "${trimmedName}" (${formatPhp(payload.pricePhp)}).`);
        setEditingId(null);
        setEditingVersion(undefined);
        setEditConflict(false);
      } else {
        await createMenuItem.mutateAsync(payload);
        showStatus(`Added "${trimmedName}" (${formatPhp(payload.pricePhp)}) to the menu.`);
      }
      if (pendingUploadedUrl && pendingUploadedUrl !== payload.imageUrl) {
        cleanupPendingUpload(pendingUploadedUrl);
      }
      setPendingUploadedUrl(null);
      setUploadedImageMeta(null);
      setUploadError(null);
      setFormErrors({});
      setForm(EMPTY_FORM);
    } catch (error) {
      if (editingId && isApiError(error) && error.status === 409) {
        setEditConflict(true);
      }
      showStatus(getApiErrorMessage(error, 'Failed to save menu listing.'), 'error');
    }
  }

  const isSavingItem =
    createMenuItem.isPending || updateMenuItem.isPending || uploadMenuImage.isPending;

  return (
    <div className="space-y-8 pb-24">
      <section className="flex flex-col gap-4 border-b border-ui-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ui-text">
            {canManageCatalog ? 'Menu & Delivery Manager' : 'Menu Stock Manager'}
          </h1>
          <p className="mt-1 text-sm text-ui-text-muted">
            {canManageCatalog
              ? 'Add new burgers, paste updated Foodpanda or Facebook photo URLs, toggle sold-out items, and configure Metro Manila delivery zones. Changes sync live to the database.'
              : 'Toggle In Stock or Sold Out availability on menu items in real time. Adding, editing, or removing listings and delivery zones requires an Owner account.'}
          </p>
        </div>

        {canManageCatalog ? (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {confirmReset ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={resetCatalog.isPending}
                  onClick={() => {
                    void resetCatalog
                      .mutateAsync()
                      .then(() => {
                        cancelEditing();
                        setConfirmReset(false);
                        setConfirmDeleteId(null);
                        showStatus('Restored the default 8Burgers Chino Roces menu.');
                      })
                      .catch((error: unknown) => {
                        showStatus(
                          getApiErrorMessage(error, 'Unable to restore default menu right now.'),
                          'error',
                        );
                      });
                  }}
                  className="rounded-xl bg-ui-error px-4 py-2 text-sm font-semibold text-ui-on-error hover:opacity-90 disabled:opacity-60"
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
          </div>
        ) : null}
      </section>

      <section aria-label="Store metrics" className="grid grid-cols-3 gap-3">
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
      </section>

      {statusBanner ? (
        statusBanner.tone === 'error' ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-xl border border-ui-error/40 bg-ui-surface px-4 py-3 text-sm font-medium text-ui-error"
          >
            <span>{statusBanner.message}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs text-ui-text-muted underline hover:text-ui-text"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center justify-between gap-4 rounded-xl border border-ui-accent/40 bg-ui-surface px-4 py-3 text-sm font-medium text-ui-text"
          >
            <span>{statusBanner.message}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs text-ui-text-muted underline hover:text-ui-text"
            >
              Dismiss
            </button>
          </div>
        )
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {canManageCatalog ? (
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

            {isEditingMissing ? (
              <div
                role="alert"
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
              >
                <span>This menu item was removed by another session.</span>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
                >
                  Cancel edit
                </button>
              </div>
            ) : editConflict ? (
              <div
                role="alert"
                className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
              >
                <span>
                  This item changed on another device. Reload latest values before saving.
                </span>
                <button
                  type="button"
                  onClick={() => void reloadLatestEditingItem()}
                  className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
                >
                  Reload latest item
                </button>
              </div>
            ) : null}

            <form
              noValidate
              onSubmit={(event) => void handleSubmit(event)}
              className="mt-4 space-y-4"
            >
              <div>
                <label
                  htmlFor="admin-item-name"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Item Name
                </label>
                <input
                  ref={nameInputRef}
                  id="admin-item-name"
                  type="text"
                  maxLength={120}
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
                    max={100000}
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
                <label
                  htmlFor="admin-item-spec"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Patty / Portion Spec
                </label>
                <input
                  id="admin-item-spec"
                  type="text"
                  maxLength={80}
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
                  maxLength={500}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="admin-item-image"
                    className="block text-xs font-semibold text-ui-text"
                  >
                    Menu Photo (Upload or Image URL)
                  </label>
                  <input
                    ref={fileInputRef}
                    id="admin-item-image-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    aria-label="Upload menu photo"
                    disabled={uploadMenuImage.isPending}
                    onChange={(event) => void handleImageFileChange(event)}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    disabled={uploadMenuImage.isPending}
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-60"
                  >
                    {uploadMenuImage.isPending ? 'Uploading & optimizing…' : 'Upload photo'}
                  </button>
                </div>
                <p className="text-[11px] text-ui-text-muted">
                  JPG, PNG, WebP, or AVIF up to 5 MB — automatically optimized to WebP and stored in
                  Supabase Storage.
                </p>
                {uploadError ? (
                  <p role="alert" className="text-xs font-semibold text-ui-error">
                    {uploadError}
                  </p>
                ) : null}
                {uploadedImageMeta && pendingUploadedUrl === form.imageUrl ? (
                  <p role="status" className="text-xs font-medium text-ui-accent tabular-nums">
                    Uploaded WebP ({formatKilobytes(uploadedImageMeta.sizeBytes)} ·{' '}
                    {uploadedImageMeta.width}×{uploadedImageMeta.height}) — save listing to publish.
                  </p>
                ) : null}
                <input
                  ref={imageInputRef}
                  id="admin-item-image"
                  type="url"
                  maxLength={500}
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
                        if (pendingUploadedUrl && pendingUploadedUrl !== preset.url) {
                          cleanupPendingUpload(pendingUploadedUrl);
                          setPendingUploadedUrl(null);
                          setUploadedImageMeta(null);
                        }
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
                disabled={isSavingItem}
                className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
              >
                {isSavingItem ? 'Saving…' : editingId ? 'Save Listing Changes' : 'Add Item to Menu'}
              </button>
            </form>
          </section>
        ) : null}

        <section
          aria-labelledby="inventory-heading"
          className={`space-y-4 ${canManageCatalog ? 'lg:col-span-7' : 'lg:col-span-12'}`}
        >
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

          {catalogQuery.isPending ? (
            <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-sm text-ui-text-muted">
              Loading menu listings…
            </div>
          ) : catalogQuery.isError ? (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-2xl border border-ui-error/40 bg-ui-surface p-6 text-sm text-ui-error sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{getApiErrorMessage(catalogQuery.error, 'Failed to load menu listings.')}</span>
              <button
                type="button"
                onClick={() => void catalogQuery.refetch()}
                className="rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
              >
                Retry
              </button>
            </div>
          ) : filteredMenu.length === 0 ? (
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
            <ul className="space-y-3">
              {filteredMenu.map((item) => {
                const isEditingItem = editingId === item.id;
                const isConfirmingDelete = confirmDeleteId === item.id;
                const isRowPending = pendingItemIds.has(item.id);
                return (
                  <li
                    key={item.id}
                    className={`flex flex-col gap-3 rounded-2xl border bg-ui-surface p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                      isEditingItem ? 'border-ui-accent' : 'border-ui-border'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
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

                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                      <button
                        type="button"
                        disabled={isRowPending}
                        aria-pressed={item.available}
                        aria-label={`${item.available ? 'In Stock' : 'Sold Out'} — toggle ${item.name}`}
                        onClick={() => {
                          setItemPending(item.id, true);
                          void setItemAvailability
                            .mutateAsync({
                              id: item.id,
                              available: !item.available,
                              expectedVersion: item.version,
                            })
                            .then((updated) => {
                              if (editingId === updated.id) {
                                setEditingVersion(updated.version);
                                setForm((prev) => ({ ...prev, available: updated.available }));
                                setEditConflict(false);
                              }
                            })
                            .catch((error: unknown) => {
                              showStatus(
                                getApiErrorMessage(error, 'Failed to toggle availability.'),
                                'error',
                              );
                            })
                            .finally(() => {
                              setItemPending(item.id, false);
                            });
                        }}
                        className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:opacity-60 ${
                          item.available
                            ? 'border-ui-border bg-ui-surface-muted text-ui-text hover:bg-ui-canvas'
                            : 'border-ui-error/40 bg-ui-error/10 text-ui-error'
                        }`}
                      >
                        {item.available ? 'In Stock' : 'Sold Out'}
                      </button>
                      {canManageCatalog ? (
                        <>
                          <button
                            type="button"
                            disabled={isRowPending}
                            aria-label={`Edit ${item.name}`}
                            onClick={() => startEditing(item)}
                            className="whitespace-nowrap rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
                          >
                            Edit
                          </button>
                          {isConfirmingDelete ? (
                            <>
                              <button
                                type="button"
                                disabled={isRowPending}
                                aria-label={`Confirm delete ${item.name}`}
                                onClick={() => {
                                  setItemPending(item.id, true);
                                  void deleteMenuItem
                                    .mutateAsync(item.id)
                                    .then(() => {
                                      if (editingId === item.id) cancelEditing();
                                      setConfirmDeleteId(null);
                                      showStatus(`Removed "${item.name}" from menu.`);
                                    })
                                    .catch((error: unknown) => {
                                      showStatus(
                                        getApiErrorMessage(error, 'Unable to delete menu item.'),
                                        'error',
                                      );
                                    })
                                    .finally(() => {
                                      setItemPending(item.id, false);
                                    });
                                }}
                                className="whitespace-nowrap rounded-lg bg-ui-error px-3 py-1.5 text-xs font-semibold text-ui-on-error hover:opacity-90 disabled:opacity-60"
                              >
                                Confirm delete
                              </button>
                              <button
                                type="button"
                                disabled={isRowPending}
                                aria-label={`Cancel delete ${item.name}`}
                                onClick={() => setConfirmDeleteId(null)}
                                className="whitespace-nowrap rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-xs font-medium text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={isRowPending}
                              aria-label={`Delete ${item.name}`}
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="whitespace-nowrap rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-error hover:bg-ui-surface-muted disabled:opacity-60"
                            >
                              Delete
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {canManageDelivery ? <AdminDeliverySettings onStatusMessage={showStatus} /> : null}
    </div>
  );
}

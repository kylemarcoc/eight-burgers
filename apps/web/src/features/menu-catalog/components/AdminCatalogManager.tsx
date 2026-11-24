import { zodResolver } from '@hookform/resolvers/zod';
import {
  MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES,
  MENU_IMAGE_MAX_UPLOAD_BYTES,
  getAdminPermissions,
  type AdminRole,
  type MenuItem,
  type MenuItemInput,
  type UploadedMenuImage,
} from '@menu-kiosk/contracts';
import { useCallback, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { FoodImage } from '@/shared/components/FoodImage';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { formatPhp } from '@/shared/shop/shop-storage';
import { useCatalogQuery, useMenuMutations } from '../hooks/useCatalog';
import {
  createMenuItemFormSchema,
  resolveEffectiveMenuCategory,
  type MenuItemFormValues,
} from '../schemas/menu-item-form.schema';
import { AdminCategoriesManager } from './AdminCategoriesManager';
import { AdminDeliverySettings } from './AdminDeliverySettings';
import { AdminOptionGroupsManager } from './AdminOptionGroupsManager';

type StatusBanner = {
  tone: 'success' | 'error';
  message: string;
};

function createEmptyForm(defaultCategoryId = ''): MenuItemFormValues {
  return {
    name: '',
    category: defaultCategoryId,
    pricePhp: '150',
    specLabel: '',
    description: '',
    imageUrl: '',
    available: true,
    featured: false,
    optionGroupIds: [],
  };
}

function itemToFormState(item: MenuItem): MenuItemFormValues {
  return {
    name: item.name,
    category: item.category,
    pricePhp: String(item.pricePhp),
    specLabel: item.specLabel,
    description: item.description,
    imageUrl: item.imageUrl,
    available: item.available,
    featured: item.featured,
    optionGroupIds: [...item.optionGroupIds],
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

  const categories = useMemo(
    () =>
      [...(catalogQuery.data?.categories ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [catalogQuery.data?.categories],
  );
  const optionGroups = useMemo(
    () =>
      [...(catalogQuery.data?.optionGroups ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [catalogQuery.data?.optionGroups],
  );
  const menu = useMemo(() => catalogQuery.data?.menu ?? [], [catalogQuery.data?.menu]);

  const categoryIds = useMemo(() => categories.map((category) => category.id), [categories]);
  const categoryLabels = useMemo(
    () => new Map<string, string>(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const firstCategoryId = categoryIds[0] ?? '';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | undefined>(undefined);
  const [editConflict, setEditConflict] = useState(false);
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState<string>('all');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingUploadedUrl, setPendingUploadedUrl] = useState<string | null>(null);
  const [uploadedImageMeta, setUploadedImageMeta] = useState<Pick<
    UploadedMenuImage,
    'sizeBytes' | 'width' | 'height'
  > | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setFocus,
    clearErrors,
    formState: { errors: formErrors },
  } = useForm<MenuItemFormValues>({
    defaultValues: createEmptyForm(firstCategoryId),
    resolver: (values, ctx, options) =>
      zodResolver(createMenuItemFormSchema({ categoryIds }))(values, ctx, options),
  });

  const watchedName = useWatch({ control, name: 'name' }) ?? '';
  const watchedImageUrl = useWatch({ control, name: 'imageUrl' }) ?? '';

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

  const nameErrorId = useId();
  const categoryErrorId = useId();
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
        item.specLabel.toLowerCase().includes(q)
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
    reset(itemToFormState(item));
    setConfirmDeleteId(null);
    setStatusBanner(null);
    setFocus('name');
  }

  function cancelEditing() {
    cleanupPendingUpload(pendingUploadedUrl);
    setPendingUploadedUrl(null);
    setUploadedImageMeta(null);
    setUploadError(null);
    setEditingId(null);
    setEditingVersion(undefined);
    setEditConflict(false);
    reset(createEmptyForm(firstCategoryId));
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
      setUploadError('Image must be 4 MB or smaller.');
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
      setValue('imageUrl', uploaded.imageUrl, { shouldDirty: true });
      clearErrors('imageUrl');
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
    reset(itemToFormState(latest));
    setEditingVersion(latest.version);
    setEditConflict(false);
    showStatus(`Reloaded latest details for "${latest.name}".`);
  }

  async function onSubmit(values: MenuItemFormValues) {
    const trimmedName = values.name.trim();
    const parsedPrice = Number(values.pricePhp);
    const trimmedDescription = values.description.trim();
    const trimmedImageUrl = values.imageUrl.trim();
    const chosenCategory = resolveEffectiveMenuCategory(values.category, categoryIds);

    const payload: MenuItemInput = {
      name: trimmedName,
      category: chosenCategory,
      pricePhp: Math.round(parsedPrice),
      specLabel: values.specLabel.trim().slice(0, 80) || 'Regular',
      description: trimmedDescription,
      imageUrl: trimmedImageUrl,
      available: values.available,
      featured: values.featured,
      optionGroupIds: values.optionGroupIds,
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
      reset(createEmptyForm(firstCategoryId));
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
              ? 'Add menu items, organize categories and option groups, upload item photos, toggle sold-out items, and configure distance-based delivery pricing.'
              : 'Toggle In Stock or Sold Out availability on menu items and modifier choices in real time. Editing listings and settings requires an Owner account.'}
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
                        showStatus('Restored the default catalog menu.');
                      })
                      .catch((error: unknown) => {
                        setConfirmReset(false);
                        showStatus(
                          isApiError(error) && error.code === 'DEMO_RESET_DISABLED'
                            ? getApiErrorMessage(
                                error,
                                'Demo catalog reset is disabled in this environment.',
                              )
                            : getApiErrorMessage(
                                error,
                                'Unable to restore default menu right now.',
                              ),
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
              onSubmit={(event) => {
                if (isSavingItem || categories.length === 0) {
                  event.preventDefault();
                  return;
                }
                void handleSubmit(onSubmit)(event);
              }}
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
                  id="admin-item-name"
                  type="text"
                  maxLength={120}
                  aria-invalid={Boolean(formErrors.name)}
                  aria-describedby={formErrors.name ? nameErrorId : undefined}
                  placeholder="e.g. Signature House Special"
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                    formErrors.name ? 'border-ui-error' : 'border-ui-border'
                  }`}
                  {...register('name')}
                />
                {formErrors.name ? (
                  <p
                    id={nameErrorId}
                    role="alert"
                    className="mt-1 text-xs font-semibold text-ui-error"
                  >
                    {formErrors.name.message}
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
                  <Controller
                    control={control}
                    name="category"
                    render={({ field }) => (
                      <select
                        id="admin-item-category"
                        name={field.name}
                        ref={field.ref}
                        value={resolveEffectiveMenuCategory(field.value, categoryIds)}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(event.target.value)}
                        disabled={categories.length === 0}
                        aria-invalid={Boolean(formErrors.category)}
                        aria-describedby={formErrors.category ? categoryErrorId : undefined}
                        className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text disabled:opacity-50 ${
                          formErrors.category ? 'border-ui-error' : 'border-ui-border'
                        }`}
                      >
                        {categories.length === 0 ? (
                          <option value="">No categories yet</option>
                        ) : (
                          categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))
                        )}
                      </select>
                    )}
                  />
                  {formErrors.category ? (
                    <p
                      id={categoryErrorId}
                      role="alert"
                      className="mt-1 text-xs font-semibold text-ui-error"
                    >
                      {formErrors.category.message}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="admin-item-price"
                    className="block text-xs font-semibold text-ui-text"
                  >
                    Price (₱)
                  </label>
                  <input
                    id="admin-item-price"
                    type="number"
                    min={1}
                    max={100000}
                    step={1}
                    aria-invalid={Boolean(formErrors.pricePhp)}
                    aria-describedby={formErrors.pricePhp ? priceErrorId : undefined}
                    className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                      formErrors.pricePhp ? 'border-ui-error' : 'border-ui-border'
                    }`}
                    {...register('pricePhp')}
                  />
                  {formErrors.pricePhp ? (
                    <p
                      id={priceErrorId}
                      role="alert"
                      className="mt-1 text-xs font-semibold text-ui-error"
                    >
                      {formErrors.pricePhp.message}
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-item-spec"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Portion / Spec Label
                </label>
                <input
                  id="admin-item-spec"
                  type="text"
                  maxLength={80}
                  placeholder="e.g. Regular, 16oz, 100g"
                  className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
                  {...register('specLabel')}
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
                  id="admin-item-description"
                  rows={3}
                  maxLength={500}
                  aria-invalid={Boolean(formErrors.description)}
                  aria-describedby={formErrors.description ? descriptionErrorId : undefined}
                  placeholder="Describe ingredients, serving notes, or highlights..."
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                    formErrors.description ? 'border-ui-error' : 'border-ui-border'
                  }`}
                  {...register('description')}
                />
                {formErrors.description ? (
                  <p
                    id={descriptionErrorId}
                    role="alert"
                    className="mt-1 text-xs font-semibold text-ui-error"
                  >
                    {formErrors.description.message}
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
                  JPG, PNG, WebP, or AVIF up to 4 MB — automatically optimized to WebP and stored in
                  Supabase Storage.
                </p>
                {uploadError ? (
                  <p role="alert" className="text-xs font-semibold text-ui-error">
                    {uploadError}
                  </p>
                ) : null}
                {uploadedImageMeta && pendingUploadedUrl === watchedImageUrl ? (
                  <p role="status" className="text-xs font-medium text-ui-accent tabular-nums">
                    Uploaded WebP ({formatKilobytes(uploadedImageMeta.sizeBytes)} ·{' '}
                    {uploadedImageMeta.width}×{uploadedImageMeta.height}) — save listing to publish.
                  </p>
                ) : null}
                <input
                  id="admin-item-image"
                  type="url"
                  maxLength={500}
                  aria-invalid={Boolean(formErrors.imageUrl)}
                  aria-describedby={formErrors.imageUrl ? imageErrorId : undefined}
                  placeholder="https://example.com/menu-photo.webp"
                  className={`w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                    formErrors.imageUrl ? 'border-ui-error' : 'border-ui-border'
                  }`}
                  {...register('imageUrl')}
                />
                {formErrors.imageUrl ? (
                  <p id={imageErrorId} role="alert" className="text-xs font-semibold text-ui-error">
                    {formErrors.imageUrl.message}
                  </p>
                ) : null}

                <div className="overflow-hidden rounded-xl border border-ui-border bg-ui-surface-muted">
                  <div className="aspect-[16/9] w-full">
                    <FoodImage
                      src={watchedImageUrl}
                      alt={watchedName || 'Menu item preview'}
                      badgeText={watchedName || 'Preview'}
                      className="h-full w-full"
                    />
                  </div>
                </div>
              </div>

              {optionGroups.length > 0 ? (
                <fieldset className="space-y-2 rounded-xl border border-ui-border bg-ui-surface-muted p-3">
                  <legend className="text-xs font-semibold text-ui-text">
                    Attached option groups
                  </legend>
                  <Controller
                    control={control}
                    name="optionGroupIds"
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-2">
                        {optionGroups.map((group) => {
                          const checked = field.value.includes(group.id);
                          return (
                            <label
                              key={group.id}
                              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                                checked
                                  ? 'border-ui-accent bg-ui-surface font-semibold text-ui-text'
                                  : 'border-ui-border bg-ui-canvas text-ui-text-muted'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onBlur={field.onBlur}
                                onChange={() => {
                                  const nextIds = checked
                                    ? field.value.filter((id) => id !== group.id)
                                    : [...field.value, group.id];
                                  field.onChange(nextIds);
                                }}
                                className="accent-ui-accent h-3.5 w-3.5 rounded"
                              />
                              <span>{group.name}</span>
                              {!group.active ? (
                                <span className="text-[10px] text-ui-error">(Paused)</span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  />
                </fieldset>
              ) : null}

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-ui-border bg-ui-surface-muted p-3 text-xs text-ui-text">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-ui-accent h-4 w-4 rounded"
                    {...register('available')}
                  />
                  <span>In stock</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-ui-accent h-4 w-4 rounded"
                    {...register('featured')}
                  />
                  <span>Featured</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSavingItem || categories.length === 0}
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
                onChange={(event) => setInventoryCategory(event.target.value)}
                className="rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-sm text-ui-text"
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
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
                            {categoryLabels.get(item.category) ?? item.category}
                          </span>
                          {isEditingItem ? (
                            <span className="rounded-md bg-ui-accent px-2 py-0.5 text-xs font-semibold text-ui-on-accent">
                              Editing
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-ui-text-muted">
                          {item.specLabel} ·{' '}
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
                                setValue('available', updated.available);
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

      {canManageCatalog ? <AdminCategoriesManager onStatusMessage={showStatus} /> : null}
      <AdminOptionGroupsManager role={role} onStatusMessage={showStatus} />
      {canManageDelivery ? <AdminDeliverySettings onStatusMessage={showStatus} /> : null}
    </div>
  );
}

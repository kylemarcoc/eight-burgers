import { zodResolver } from '@hookform/resolvers/zod';
import {
  CURATED_STORE_THEME_PRESET_VALUES,
  MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES,
  MENU_IMAGE_MAX_UPLOAD_BYTES,
  STORE_THEME_TOKENS,
  getContrastRatio,
  resolveStoreAccentTokens,
  storeAccentHexSchema,
  type StoreProfile,
} from '@menu-kiosk/contracts';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import {
  useDeleteUnusedStoreAssetMutation,
  useStoreProfile,
  useUpdateStoreProfileMutation,
  useUploadStoreAssetMutation,
} from '../hooks/useStoreSettings';
import {
  storeBrandingThemeFormSchema,
  type StoreBrandingThemeFormValues,
} from '../schemas/store-branding-theme-form.schema';

const ALLOWED_MIME_SET = new Set<string>(MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES);

function storeToBrandingState(store: StoreProfile): StoreBrandingThemeFormValues {
  return {
    logoUrl: store.logoUrl,
    heroImageUrl: store.heroImageUrl,
    themeAccentPreset: store.themeAccentPreset,
    themeAccentHex: store.themeAccentHex ?? '#c2410c',
  };
}

function getBrandingSignature(store: StoreProfile): string {
  return JSON.stringify([
    store.logoUrl,
    store.heroImageUrl,
    store.themeAccentPreset,
    store.themeAccentHex,
    store.version ?? null,
  ]);
}

function formatKilobytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type StoreBrandingThemeFormProps = {
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function StoreBrandingThemeForm({ onStatusMessage }: StoreBrandingThemeFormProps) {
  const { store, catalogQuery } = useStoreProfile();
  const updateProfileMutation = useUpdateStoreProfileMutation();
  const uploadAssetMutation = useUploadStoreAssetMutation();
  const deleteUnusedAssetMutation = useDeleteUnusedStoreAssetMutation();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<StoreBrandingThemeFormValues>({
    defaultValues: storeToBrandingState(store),
    resolver: zodResolver(storeBrandingThemeFormSchema),
  });

  const watched = useWatch({ control });
  const logoUrl = watched.logoUrl ?? store.logoUrl;
  const heroImageUrl = watched.heroImageUrl ?? store.heroImageUrl;
  const themeAccentPreset = watched.themeAccentPreset ?? store.themeAccentPreset;
  const themeAccentHex = watched.themeAccentHex ?? store.themeAccentHex ?? '#c2410c';

  const loadedVersionRef = useRef<number | undefined>(store.version);
  const [conflict, setConflict] = useState(false);
  const [pendingLogoUpload, setPendingLogoUpload] = useState<string | null>(null);
  const [pendingHeroUpload, setPendingHeroUpload] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const lastSyncedSignatureRef = useRef(getBrandingSignature(store));

  const currentSignature = getBrandingSignature(store);

  useEffect(() => {
    if (!isDirty && currentSignature !== lastSyncedSignatureRef.current) {
      lastSyncedSignatureRef.current = currentSignature;
      reset(storeToBrandingState(store));
      loadedVersionRef.current = store.version;
      setConflict(false);
    }
  }, [currentSignature, isDirty, reset, store]);

  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const heroFileRef = useRef<HTMLInputElement | null>(null);
  const headingId = useId();
  const customHexInputId = useId();

  const cleanupUnusedAsset = useCallback(
    (url: string | null) => {
      if (!url) return;
      deleteUnusedAssetMutation.mutate(url);
    },
    [deleteUnusedAssetMutation],
  );

  const previewTokens = useMemo(
    () =>
      resolveStoreAccentTokens(
        themeAccentPreset,
        themeAccentPreset === 'custom' ? themeAccentHex : null,
      ),
    [themeAccentPreset, themeAccentHex],
  );

  const lightContrast = useMemo(
    () => getContrastRatio(previewTokens.light.accent, previewTokens.light.onAccent),
    [previewTokens.light.accent, previewTokens.light.onAccent],
  );
  const darkContrast = useMemo(
    () => getContrastRatio(previewTokens.dark.accent, previewTokens.dark.onAccent),
    [previewTokens.dark.accent, previewTokens.dark.onAccent],
  );

  async function reloadLatestBranding() {
    cleanupUnusedAsset(pendingLogoUpload);
    cleanupUnusedAsset(pendingHeroUpload);
    setPendingLogoUpload(null);
    setPendingHeroUpload(null);
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.store ?? store;
    lastSyncedSignatureRef.current = getBrandingSignature(latest);
    reset(storeToBrandingState(latest));
    loadedVersionRef.current = latest.version;
    setConflict(false);
    setUploadError(null);
    onStatusMessage('Reloaded latest branding and theme settings.');
  }

  async function handleAssetUpload(event: ChangeEvent<HTMLInputElement>, purpose: 'logo' | 'hero') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.type && !ALLOWED_MIME_SET.has(file.type)) {
      setUploadError('Select a JPG, PNG, WebP, or AVIF image file.');
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
    try {
      const uploaded = await uploadAssetMutation.mutateAsync({ file, purpose });
      if (purpose === 'logo') {
        if (pendingLogoUpload && pendingLogoUpload !== uploaded.imageUrl) {
          cleanupUnusedAsset(pendingLogoUpload);
        }
        setPendingLogoUpload(uploaded.imageUrl);
        setValue('logoUrl', uploaded.imageUrl, { shouldDirty: true });
        clearErrors('logoUrl');
      } else {
        if (pendingHeroUpload && pendingHeroUpload !== uploaded.imageUrl) {
          cleanupUnusedAsset(pendingHeroUpload);
        }
        setPendingHeroUpload(uploaded.imageUrl);
        setValue('heroImageUrl', uploaded.imageUrl, { shouldDirty: true });
        clearErrors('heroImageUrl');
      }
      clearErrors('root');
      onStatusMessage(
        `Uploaded ${purpose} (${formatKilobytes(uploaded.sizeBytes)}, ${uploaded.width}×${uploaded.height}). Save branding to publish.`,
      );
    } catch (error) {
      setUploadError(getApiErrorMessage(error, `Unable to upload ${purpose} right now.`));
    }
  }

  async function onSubmit(values: StoreBrandingThemeFormValues) {
    const trimmedLogo = values.logoUrl.trim();
    const trimmedHero = values.heroImageUrl.trim();
    const resolvedCustomHex =
      values.themeAccentPreset === 'custom'
        ? storeAccentHexSchema.parse(values.themeAccentHex)
        : null;

    clearErrors('root');
    try {
      const updated = await updateProfileMutation.mutateAsync({
        logoUrl: trimmedLogo,
        heroImageUrl: trimmedHero,
        themeAccentPreset: values.themeAccentPreset,
        themeAccentHex: resolvedCustomHex,
        expectedVersion: loadedVersionRef.current ?? store.version,
      });

      if (pendingLogoUpload && pendingLogoUpload !== trimmedLogo) {
        cleanupUnusedAsset(pendingLogoUpload);
      }
      if (pendingHeroUpload && pendingHeroUpload !== trimmedHero) {
        cleanupUnusedAsset(pendingHeroUpload);
      }
      setPendingLogoUpload(null);
      setPendingHeroUpload(null);
      lastSyncedSignatureRef.current = getBrandingSignature(updated);
      reset(storeToBrandingState(updated));
      loadedVersionRef.current = updated.version;
      setConflict(false);
      onStatusMessage('Saved branding and theme settings.');
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setConflict(true);
      }
      onStatusMessage(getApiErrorMessage(error, 'Failed to save branding settings.'), 'error');
    }
  }

  const isBusy = updateProfileMutation.isPending || uploadAssetMutation.isPending;
  const fieldError =
    errors.logoUrl?.message ??
    errors.heroImageUrl?.message ??
    errors.themeAccentHex?.message ??
    errors.root?.message;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-5 rounded-2xl border border-ui-border bg-ui-surface p-5"
    >
      <div className="border-b border-ui-border pb-3">
        <h2 id={headingId} className="text-lg font-bold text-ui-text">
          Branding & theme accent
        </h2>
        <p className="mt-0.5 text-xs text-ui-text-muted">
          Upload your shop logo and hero image, or leave the hero blank for a clean typographic
          storefront header. Accent colors automatically meet WCAG AA contrast in light and dark
          modes.
        </p>
      </div>

      {conflict ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
        >
          <span>Branding settings changed on another device. Reload latest values first.</span>
          <button
            type="button"
            onClick={() => void reloadLatestBranding()}
            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Reload latest branding
          </button>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => {
          if (isBusy) {
            event.preventDefault();
            return;
          }
          void handleSubmit(onSubmit)(event);
        }}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2.5 rounded-xl border border-ui-border bg-ui-canvas p-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="store-logo-url" className="text-xs font-semibold text-ui-text">
                Store logo
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label="Upload store logo"
                  disabled={uploadAssetMutation.isPending}
                  onChange={(event) => void handleAssetUpload(event, 'logo')}
                  className="sr-only"
                />
                <button
                  type="button"
                  disabled={uploadAssetMutation.isPending}
                  onClick={() => logoFileRef.current?.click()}
                  className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
                >
                  {uploadAssetMutation.isPending ? 'Uploading…' : 'Upload logo'}
                </button>
                {logoUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingLogoUpload) {
                        cleanupUnusedAsset(pendingLogoUpload);
                        setPendingLogoUpload(null);
                      }
                      setValue('logoUrl', '', { shouldDirty: true });
                      clearErrors('logoUrl');
                    }}
                    className="rounded-lg border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-error hover:bg-ui-surface-muted"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Store logo preview"
                  className="h-12 w-12 rounded-xl border border-ui-border bg-ui-surface object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ui-accent text-base font-extrabold text-ui-on-accent">
                  {store.monogram}
                </span>
              )}
              <input
                id="store-logo-url"
                type="url"
                maxLength={500}
                placeholder="https://... or leave blank for monogram"
                className="min-w-0 flex-1 rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs text-ui-text"
                {...register('logoUrl')}
              />
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl border border-ui-border bg-ui-canvas p-4">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="store-hero-url" className="text-xs font-semibold text-ui-text">
                Hero banner image
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  ref={heroFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  aria-label="Upload hero banner"
                  disabled={uploadAssetMutation.isPending}
                  onChange={(event) => void handleAssetUpload(event, 'hero')}
                  className="sr-only"
                />
                <button
                  type="button"
                  disabled={uploadAssetMutation.isPending}
                  onClick={() => heroFileRef.current?.click()}
                  className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
                >
                  {uploadAssetMutation.isPending ? 'Uploading…' : 'Upload hero'}
                </button>
                {heroImageUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingHeroUpload) {
                        cleanupUnusedAsset(pendingHeroUpload);
                        setPendingHeroUpload(null);
                      }
                      setValue('heroImageUrl', '', { shouldDirty: true });
                      clearErrors('heroImageUrl');
                    }}
                    className="rounded-lg border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-error hover:bg-ui-surface-muted"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            <input
              id="store-hero-url"
              type="url"
              maxLength={500}
              placeholder="Leave blank for typographic storefront hero"
              className="w-full rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs text-ui-text"
              {...register('heroImageUrl')}
            />
            {heroImageUrl ? (
              <div className="aspect-[16/7] overflow-hidden rounded-lg border border-ui-border bg-ui-surface">
                <img
                  src={heroImageUrl}
                  alt="Hero banner preview"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <p className="text-[11px] text-ui-text-muted">
                No hero image set — storefront will show a clean typographic banner.
              </p>
            )}
          </div>
        </div>

        {uploadError ? (
          <p role="alert" className="text-xs font-semibold text-ui-error">
            {uploadError}
          </p>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-ui-text">Accent color preset</legend>
          <Controller
            control={control}
            name="themeAccentPreset"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {CURATED_STORE_THEME_PRESET_VALUES.map((preset) => {
                  const tokenPair = STORE_THEME_TOKENS[preset];
                  const isSelected = field.value === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={isSelected}
                      onBlur={field.onBlur}
                      onClick={() => {
                        field.onChange(preset);
                        clearErrors('themeAccentHex');
                      }}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors motion-reduce:transition-none ${
                        isSelected
                          ? 'border-ui-accent bg-ui-surface-muted text-ui-text'
                          : 'border-ui-border bg-ui-canvas text-ui-text-muted hover:text-ui-text'
                      }`}
                    >
                      <span>{tokenPair.label}</span>
                      <span className="flex items-center gap-1" aria-hidden="true">
                        <span
                          className="h-4 w-4 rounded-full border border-ui-border"
                          style={{ backgroundColor: tokenPair.light.accent }}
                        />
                        <span
                          className="h-4 w-4 rounded-full border border-ui-border"
                          style={{ backgroundColor: tokenPair.dark.accent }}
                        />
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  aria-pressed={field.value === 'custom'}
                  onBlur={field.onBlur}
                  onClick={() => {
                    field.onChange('custom');
                    clearErrors('themeAccentHex');
                  }}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors motion-reduce:transition-none ${
                    field.value === 'custom'
                      ? 'border-ui-accent bg-ui-surface-muted text-ui-text'
                      : 'border-ui-border bg-ui-canvas text-ui-text-muted hover:text-ui-text'
                  }`}
                >
                  <span>Custom hex</span>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full border border-ui-border"
                    style={{
                      backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(themeAccentHex)
                        ? themeAccentHex
                        : '#c2410c',
                    }}
                  />
                </button>
              </div>
            )}
          />

          {themeAccentPreset === 'custom' ? (
            <Controller
              control={control}
              name="themeAccentHex"
              render={({ field }) => (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ui-border bg-ui-canvas p-3">
                  <label htmlFor={customHexInputId} className="text-xs font-semibold text-ui-text">
                    Custom brand hex
                  </label>
                  <input
                    type="color"
                    aria-label="Pick custom brand color"
                    value={/^#[0-9A-Fa-f]{6}$/.test(field.value) ? field.value : '#c2410c'}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                      clearErrors('themeAccentHex');
                    }}
                    className="h-8 w-10 cursor-pointer rounded border border-ui-border bg-transparent"
                  />
                  <input
                    id={customHexInputId}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(event.target.value)}
                    type="text"
                    maxLength={7}
                    placeholder="#c2410c"
                    className="w-28 rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 font-mono text-xs text-ui-text"
                  />
                  <span className="text-[11px] text-ui-text-muted">
                    Luminance is automatically clamped to maintain WCAG AA contrast.
                  </span>
                </div>
              )}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              className="flex items-center justify-between gap-3 rounded-xl border p-3"
              style={{
                backgroundColor: '#faf6f0',
                borderColor: '#e2d8c9',
                color: '#1c1917',
              }}
            >
              <div>
                <p className="text-xs font-semibold">Light mode preview</p>
                <p className="text-[11px] tabular-nums opacity-75">
                  {previewTokens.light.accent} · {lightContrast.toFixed(1)}:1 contrast
                </p>
              </div>
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: previewTokens.light.accent,
                  color: previewTokens.light.onAccent,
                }}
              >
                Order now
              </span>
            </div>

            <div
              className="flex items-center justify-between gap-3 rounded-xl border p-3"
              style={{
                backgroundColor: '#12100e',
                borderColor: '#3f3a36',
                color: '#fafaf9',
              }}
            >
              <div>
                <p className="text-xs font-semibold">Dark mode preview</p>
                <p className="text-[11px] tabular-nums opacity-75">
                  {previewTokens.dark.accent} · {darkContrast.toFixed(1)}:1 contrast
                </p>
              </div>
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: previewTokens.dark.accent,
                  color: previewTokens.dark.onAccent,
                }}
              >
                Order now
              </span>
            </div>
          </div>
        </fieldset>

        {fieldError ? (
          <p role="alert" className="text-xs font-semibold text-ui-error">
            {fieldError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isBusy}
          className="rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
        >
          {updateProfileMutation.isPending ? 'Saving branding…' : 'Save branding & theme'}
        </button>
      </form>
    </section>
  );
}

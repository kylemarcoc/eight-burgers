import { zodResolver } from '@hookform/resolvers/zod';
import { type ExternalLink, type StoreProfile } from '@menu-kiosk/contracts';
import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { useStoreProfile, useUpdateStoreProfileMutation } from '../hooks/useStoreSettings';
import {
  storeProfileFormSchema,
  type StoreProfileFormValues,
} from '../schemas/store-profile-form.schema';

function profileToFormState(store: StoreProfile): StoreProfileFormValues {
  return {
    storeName: store.storeName,
    branchLabel: store.branchLabel,
    monogram: store.monogram,
    heroHeadline: store.heroHeadline,
    heroSubtext: store.heroSubtext,
    heroBadgeLabel: store.heroBadgeLabel,
    address: store.address,
    landmark: store.landmark,
    contactPhone: store.contactPhone,
    hoursText: store.hoursText,
    pickupSpotLabel: store.pickupSpotLabel,
    queuePrefix: store.queuePrefix,
    preparingStageLabel: store.preparingStageLabel,
    externalLinks: store.externalLinks.map((link) => ({ ...link })),
  };
}

function getProfileSignature(store: StoreProfile): string {
  return JSON.stringify([
    store.storeName,
    store.branchLabel,
    store.monogram,
    store.heroHeadline,
    store.heroSubtext,
    store.heroBadgeLabel,
    store.address,
    store.landmark,
    store.contactPhone,
    store.hoursText,
    store.pickupSpotLabel,
    store.queuePrefix,
    store.preparingStageLabel,
    store.externalLinks,
    store.version ?? null,
  ]);
}

export type StoreProfileFormProps = {
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function StoreProfileForm({ onStatusMessage }: StoreProfileFormProps) {
  const { store, catalogQuery } = useStoreProfile();
  const updateProfileMutation = useUpdateStoreProfileMutation();

  const {
    register,
    control,
    handleSubmit,
    reset,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<StoreProfileFormValues>({
    defaultValues: profileToFormState(store),
    resolver: zodResolver(storeProfileFormSchema),
  });

  const {
    fields: externalLinkFields,
    append,
    remove,
  } = useFieldArray({
    control,
    name: 'externalLinks',
  });

  const watchedQueuePrefix = useWatch({ control, name: 'queuePrefix' }) ?? '';

  const loadedVersionRef = useRef<number | undefined>(store.version);
  const [conflict, setConflict] = useState(false);
  const lastSyncedSignatureRef = useRef(getProfileSignature(store));

  const currentSignature = getProfileSignature(store);

  useEffect(() => {
    if (!isDirty && currentSignature !== lastSyncedSignatureRef.current) {
      lastSyncedSignatureRef.current = currentSignature;
      reset(profileToFormState(store));
      loadedVersionRef.current = store.version;
      setConflict(false);
    }
  }, [currentSignature, isDirty, reset, store]);

  const headingId = useId();
  const storeNameErrorId = useId();
  const monogramErrorId = useId();
  const queuePrefixErrorId = useId();
  const preparingLabelErrorId = useId();
  const linksErrorId = useId();

  async function reloadLatestProfile() {
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.store ?? store;
    lastSyncedSignatureRef.current = getProfileSignature(latest);
    reset(profileToFormState(latest));
    loadedVersionRef.current = latest.version;
    setConflict(false);
    onStatusMessage('Reloaded latest store profile.');
  }

  async function onSubmit(values: StoreProfileFormValues) {
    const cleanedLinks: ExternalLink[] = [];
    for (const link of values.externalLinks) {
      const label = link.label.trim();
      const url = link.url.trim();
      if (!label && !url) continue;
      cleanedLinks.push({ label: label.slice(0, 40), url: url.slice(0, 500) });
    }

    try {
      const updated = await updateProfileMutation.mutateAsync({
        storeName: values.storeName.trim(),
        branchLabel: values.branchLabel.trim().slice(0, 120),
        monogram: values.monogram.trim(),
        heroHeadline: values.heroHeadline.trim().slice(0, 160),
        heroSubtext: values.heroSubtext.trim().slice(0, 280),
        heroBadgeLabel: values.heroBadgeLabel.trim().slice(0, 80),
        address: values.address.trim().slice(0, 240),
        landmark: values.landmark.trim().slice(0, 200),
        contactPhone: values.contactPhone.trim().slice(0, 40),
        hoursText: values.hoursText.trim().slice(0, 120),
        pickupSpotLabel: values.pickupSpotLabel.trim().slice(0, 80),
        queuePrefix: values.queuePrefix.trim().toUpperCase(),
        preparingStageLabel: values.preparingStageLabel.trim(),
        externalLinks: cleanedLinks,
        expectedVersion: loadedVersionRef.current ?? store.version,
      });

      lastSyncedSignatureRef.current = getProfileSignature(updated);
      reset(profileToFormState(updated));
      loadedVersionRef.current = updated.version;
      setConflict(false);
      onStatusMessage(`Saved store profile for ${updated.storeName}.`);
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setConflict(true);
      }
      onStatusMessage(getApiErrorMessage(error, 'Failed to save store profile.'), 'error');
    }
  }

  const externalLinksError =
    errors.externalLinks?.root?.message ?? errors.externalLinks?.message ?? undefined;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface p-5"
    >
      <div className="border-b border-ui-border pb-3">
        <h2 id={headingId} className="text-lg font-bold text-ui-text">
          Store profile & operations
        </h2>
        <p className="mt-0.5 text-xs text-ui-text-muted">
          Configure your shop identity, branch details, operating hours, order queue prefix, and
          external links shown on the storefront.
        </p>
      </div>

      {conflict ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
        >
          <span>Store profile changed on another device. Reload latest values before saving.</span>
          <button
            type="button"
            onClick={() => void reloadLatestProfile()}
            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Reload latest profile
          </button>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => {
          if (updateProfileMutation.isPending) {
            event.preventDefault();
            return;
          }
          void handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label
              htmlFor="store-profile-name"
              className="block text-xs font-semibold text-ui-text"
            >
              Store name
            </label>
            <input
              id="store-profile-name"
              type="text"
              maxLength={80}
              aria-invalid={Boolean(errors.storeName)}
              aria-describedby={errors.storeName ? storeNameErrorId : undefined}
              placeholder="e.g. Kape Kanto"
              className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                errors.storeName ? 'border-ui-error' : 'border-ui-border'
              }`}
              {...register('storeName')}
            />
            {errors.storeName ? (
              <p
                id={storeNameErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.storeName.message}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-5">
            <label
              htmlFor="store-profile-branch"
              className="block text-xs font-semibold text-ui-text"
            >
              Branch / location label
            </label>
            <input
              id="store-profile-branch"
              type="text"
              maxLength={120}
              placeholder="e.g. Cebu IT Park"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('branchLabel')}
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="store-profile-monogram"
              className="block text-xs font-semibold text-ui-text"
            >
              Monogram
            </label>
            <Controller
              control={control}
              name="monogram"
              render={({ field }) => (
                <input
                  {...field}
                  id="store-profile-monogram"
                  type="text"
                  maxLength={3}
                  aria-invalid={Boolean(errors.monogram)}
                  aria-describedby={errors.monogram ? monogramErrorId : undefined}
                  onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                  placeholder="KK"
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm font-semibold text-ui-text uppercase ${
                    errors.monogram ? 'border-ui-error' : 'border-ui-border'
                  }`}
                />
              )}
            />
            {errors.monogram ? (
              <p
                id={monogramErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.monogram.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="store-profile-headline"
              className="block text-xs font-semibold text-ui-text"
            >
              Hero headline
            </label>
            <input
              id="store-profile-headline"
              type="text"
              maxLength={160}
              placeholder="Freshly made to order."
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('heroHeadline')}
            />
          </div>

          <div>
            <label
              htmlFor="store-profile-badge"
              className="block text-xs font-semibold text-ui-text"
            >
              Specialty highlight (optional)
            </label>
            <input
              id="store-profile-badge"
              type="text"
              maxLength={80}
              placeholder="e.g. Small-batch roasted daily"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('heroBadgeLabel')}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="store-profile-subtext"
            className="block text-xs font-semibold text-ui-text"
          >
            Hero description
          </label>
          <textarea
            id="store-profile-subtext"
            rows={2}
            maxLength={280}
            placeholder="Short welcome note or pickup and delivery details for customers."
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
            {...register('heroSubtext')}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="store-profile-address"
              className="block text-xs font-semibold text-ui-text"
            >
              Street address
            </label>
            <input
              id="store-profile-address"
              type="text"
              maxLength={240}
              placeholder="Street, building, barangay, city"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('address')}
            />
          </div>

          <div>
            <label
              htmlFor="store-profile-landmark"
              className="block text-xs font-semibold text-ui-text"
            >
              Landmark
            </label>
            <input
              id="store-profile-landmark"
              type="text"
              maxLength={200}
              placeholder="e.g. Ground floor beside main lobby"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('landmark')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="store-profile-phone"
              className="block text-xs font-semibold text-ui-text"
            >
              Contact phone
            </label>
            <input
              id="store-profile-phone"
              type="tel"
              maxLength={40}
              placeholder="0917 000 0000"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('contactPhone')}
            />
          </div>

          <div>
            <label
              htmlFor="store-profile-hours"
              className="block text-xs font-semibold text-ui-text"
            >
              Operating hours
            </label>
            <input
              id="store-profile-hours"
              type="text"
              maxLength={120}
              placeholder="Daily · 8:00 AM – 9:00 PM"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('hoursText')}
            />
          </div>

          <div>
            <label
              htmlFor="store-profile-pickup-spot"
              className="block text-xs font-semibold text-ui-text"
            >
              Pickup label
            </label>
            <input
              id="store-profile-pickup-spot"
              type="text"
              maxLength={80}
              placeholder="Counter Pickup"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              {...register('pickupSpotLabel')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-ui-border pt-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="store-profile-queue-prefix"
              className="block text-xs font-semibold text-ui-text"
            >
              Queue number prefix
            </label>
            <Controller
              control={control}
              name="queuePrefix"
              render={({ field }) => (
                <input
                  {...field}
                  id="store-profile-queue-prefix"
                  type="text"
                  maxLength={4}
                  aria-invalid={Boolean(errors.queuePrefix)}
                  aria-describedby={errors.queuePrefix ? queuePrefixErrorId : undefined}
                  onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                  placeholder="ORD"
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm font-semibold text-ui-text uppercase ${
                    errors.queuePrefix ? 'border-ui-error' : 'border-ui-border'
                  }`}
                />
              )}
            />
            <p className="mt-1 text-[11px] text-ui-text-muted">
              2 to 4 letters/numbers (e.g. #{watchedQueuePrefix.trim().toUpperCase() || 'ORD'}
              -101). Older order numbers stay trackable.
            </p>
            {errors.queuePrefix ? (
              <p
                id={queuePrefixErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.queuePrefix.message}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="store-profile-preparing-label"
              className="block text-xs font-semibold text-ui-text"
            >
              Preparing stage label
            </label>
            <input
              id="store-profile-preparing-label"
              type="text"
              maxLength={40}
              aria-invalid={Boolean(errors.preparingStageLabel)}
              aria-describedby={errors.preparingStageLabel ? preparingLabelErrorId : undefined}
              placeholder="e.g. Preparing, Brewing, On the Grill"
              className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                errors.preparingStageLabel ? 'border-ui-error' : 'border-ui-border'
              }`}
              {...register('preparingStageLabel')}
            />
            {errors.preparingStageLabel ? (
              <p
                id={preparingLabelErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.preparingStageLabel.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2.5 border-t border-ui-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-ui-text">External links</h3>
              <p className="text-[11px] text-ui-text-muted">
                Optional HTTPS links (such as social pages or delivery marketplaces, up to 6).
              </p>
            </div>
            <button
              type="button"
              disabled={externalLinkFields.length >= 6}
              onClick={() => {
                if (externalLinkFields.length < 6) {
                  append({ label: '', url: '' });
                }
              }}
              className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
            >
              Add link
            </button>
          </div>

          {externalLinkFields.length > 0 ? (
            <div className="space-y-2">
              {externalLinkFields.map((linkField, index) => (
                <div key={linkField.id} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    type="text"
                    maxLength={40}
                    aria-label={`External link ${index + 1} label`}
                    placeholder="Label (e.g. Instagram)"
                    className="rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text sm:col-span-4"
                    {...register(`externalLinks.${index}.label`, {
                      onChange: () => {
                        if (externalLinksError) clearErrors('externalLinks');
                      },
                    })}
                  />
                  <input
                    type="url"
                    maxLength={500}
                    aria-label={`External link ${index + 1} URL`}
                    aria-describedby={externalLinksError ? linksErrorId : undefined}
                    placeholder="https://..."
                    className="rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text sm:col-span-6"
                    {...register(`externalLinks.${index}.url`, {
                      onChange: () => {
                        if (externalLinksError) clearErrors('externalLinks');
                      },
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      remove(index);
                      if (externalLinksError) clearErrors('externalLinks');
                    }}
                    aria-label={`Remove external link ${index + 1}`}
                    className="rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-error hover:bg-ui-canvas sm:col-span-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {externalLinksError ? (
            <p id={linksErrorId} role="alert" className="text-xs font-semibold text-ui-error">
              {externalLinksError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={updateProfileMutation.isPending}
          className="rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
        >
          {updateProfileMutation.isPending ? 'Saving profile…' : 'Save store profile'}
        </button>
      </form>
    </section>
  );
}

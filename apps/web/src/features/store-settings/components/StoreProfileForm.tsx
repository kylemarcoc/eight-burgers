import {
  isSafeExternalUrl,
  storeMonogramSchema,
  storeQueuePrefixSchema,
  type ExternalLink,
  type StoreProfile,
} from '@menu-kiosk/contracts';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { useStoreProfile, useUpdateStoreProfileMutation } from '../hooks/useStoreSettings';

type ProfileFormState = {
  storeName: string;
  branchLabel: string;
  monogram: string;
  heroHeadline: string;
  heroSubtext: string;
  heroBadgeLabel: string;
  address: string;
  landmark: string;
  contactPhone: string;
  hoursText: string;
  pickupSpotLabel: string;
  queuePrefix: string;
  preparingStageLabel: string;
  externalLinks: ExternalLink[];
};

type ProfileFormErrors = {
  storeName?: string;
  monogram?: string;
  queuePrefix?: string;
  preparingStageLabel?: string;
  externalLinks?: string;
};

function profileToFormState(store: StoreProfile): ProfileFormState {
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

  const [form, setForm] = useState<ProfileFormState>(() => profileToFormState(store));
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>(store.version);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [conflict, setConflict] = useState(false);
  const [lastSyncedSignature, setLastSyncedSignature] = useState(() => getProfileSignature(store));

  const currentSignature = getProfileSignature(store);
  if (currentSignature !== lastSyncedSignature) {
    setLastSyncedSignature(currentSignature);
    if (!isDirty) {
      setForm(profileToFormState(store));
      setLoadedVersion(store.version);
      setErrors({});
      setConflict(false);
    }
  }

  const storeNameRef = useRef<HTMLInputElement | null>(null);
  const monogramRef = useRef<HTMLInputElement | null>(null);
  const queuePrefixRef = useRef<HTMLInputElement | null>(null);
  const preparingLabelRef = useRef<HTMLInputElement | null>(null);

  const headingId = useId();
  const storeNameErrorId = useId();
  const monogramErrorId = useId();
  const queuePrefixErrorId = useId();
  const preparingLabelErrorId = useId();
  const linksErrorId = useId();

  async function reloadLatestProfile() {
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.store ?? store;
    setForm(profileToFormState(latest));
    setLoadedVersion(latest.version);
    setLastSyncedSignature(getProfileSignature(latest));
    setIsDirty(false);
    setConflict(false);
    setErrors({});
    onStatusMessage('Reloaded latest store profile.');
  }

  function updateField<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  function handleAddLink() {
    if (form.externalLinks.length >= 6) return;
    updateField('externalLinks', [...form.externalLinks, { label: '', url: '' }]);
  }

  function handleUpdateLink(index: number, field: keyof ExternalLink, value: string) {
    const next = form.externalLinks.map((link, idx) =>
      idx === index ? { ...link, [field]: value } : link,
    );
    updateField('externalLinks', next);
    if (errors.externalLinks) {
      setErrors((prev) => ({ ...prev, externalLinks: undefined }));
    }
  }

  function handleRemoveLink(index: number) {
    updateField(
      'externalLinks',
      form.externalLinks.filter((_, idx) => idx !== index),
    );
    if (errors.externalLinks) {
      setErrors((prev) => ({ ...prev, externalLinks: undefined }));
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = form.storeName.trim();
    const monogramResult = storeMonogramSchema.safeParse(form.monogram);
    const queuePrefixResult = storeQueuePrefixSchema.safeParse(form.queuePrefix);
    const trimmedPreparing = form.preparingStageLabel.trim();

    const cleanedLinks: ExternalLink[] = [];
    let linkError: string | undefined;
    for (const link of form.externalLinks) {
      const label = link.label.trim();
      const url = link.url.trim();
      if (!label && !url) continue;
      if (!label) {
        linkError = 'Enter a label for every external link.';
        break;
      }
      if (!isSafeExternalUrl(url)) {
        linkError = 'External links must start with https:// and contain no credentials.';
        break;
      }
      cleanedLinks.push({ label: label.slice(0, 40), url: url.slice(0, 500) });
    }

    const nextErrors: ProfileFormErrors = {};
    if (!trimmedName) {
      nextErrors.storeName = 'Store name is required.';
    }
    if (!monogramResult.success) {
      nextErrors.monogram =
        monogramResult.error.issues[0]?.message ?? 'Monogram must be 1 to 3 letters or numbers.';
    }
    if (!queuePrefixResult.success) {
      nextErrors.queuePrefix =
        queuePrefixResult.error.issues[0]?.message ??
        'Queue prefix must be 2 to 4 letters or numbers.';
    }
    if (!trimmedPreparing) {
      nextErrors.preparingStageLabel = 'Preparing stage label is required.';
    }
    if (linkError) {
      nextErrors.externalLinks = linkError;
    }

    if (
      nextErrors.storeName ||
      nextErrors.monogram ||
      nextErrors.queuePrefix ||
      nextErrors.preparingStageLabel ||
      nextErrors.externalLinks
    ) {
      setErrors(nextErrors);
      if (nextErrors.storeName) {
        storeNameRef.current?.focus();
      } else if (nextErrors.monogram) {
        monogramRef.current?.focus();
      } else if (nextErrors.queuePrefix) {
        queuePrefixRef.current?.focus();
      } else if (nextErrors.preparingStageLabel) {
        preparingLabelRef.current?.focus();
      }
      return;
    }

    try {
      const updated = await updateProfileMutation.mutateAsync({
        storeName: trimmedName,
        branchLabel: form.branchLabel.trim(),
        monogram: monogramResult.success ? monogramResult.data : form.monogram.trim(),
        heroHeadline: form.heroHeadline.trim(),
        heroSubtext: form.heroSubtext.trim(),
        heroBadgeLabel: form.heroBadgeLabel.trim(),
        address: form.address.trim(),
        landmark: form.landmark.trim(),
        contactPhone: form.contactPhone.trim(),
        hoursText: form.hoursText.trim(),
        pickupSpotLabel: form.pickupSpotLabel.trim(),
        queuePrefix: queuePrefixResult.success
          ? queuePrefixResult.data
          : form.queuePrefix.trim().toUpperCase(),
        preparingStageLabel: trimmedPreparing,
        externalLinks: cleanedLinks,
        expectedVersion: loadedVersion ?? store.version,
      });

      setForm(profileToFormState(updated));
      setLoadedVersion(updated.version);
      setLastSyncedSignature(getProfileSignature(updated));
      setIsDirty(false);
      setConflict(false);
      setErrors({});
      onStatusMessage(`Saved store profile for ${updated.storeName}.`);
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setConflict(true);
      }
      onStatusMessage(getApiErrorMessage(error, 'Failed to save store profile.'), 'error');
    }
  }

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

      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label
              htmlFor="store-profile-name"
              className="block text-xs font-semibold text-ui-text"
            >
              Store name
            </label>
            <input
              ref={storeNameRef}
              id="store-profile-name"
              type="text"
              maxLength={80}
              value={form.storeName}
              aria-invalid={Boolean(errors.storeName)}
              aria-describedby={errors.storeName ? storeNameErrorId : undefined}
              onChange={(event) => {
                updateField('storeName', event.target.value);
                if (errors.storeName && event.target.value.trim()) {
                  setErrors((prev) => ({ ...prev, storeName: undefined }));
                }
              }}
              placeholder="e.g. Kape Kanto"
              className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                errors.storeName ? 'border-ui-error' : 'border-ui-border'
              }`}
            />
            {errors.storeName ? (
              <p
                id={storeNameErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.storeName}
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
              value={form.branchLabel}
              onChange={(event) => updateField('branchLabel', event.target.value)}
              placeholder="e.g. Cebu IT Park"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="store-profile-monogram"
              className="block text-xs font-semibold text-ui-text"
            >
              Monogram
            </label>
            <input
              ref={monogramRef}
              id="store-profile-monogram"
              type="text"
              maxLength={3}
              value={form.monogram}
              aria-invalid={Boolean(errors.monogram)}
              aria-describedby={errors.monogram ? monogramErrorId : undefined}
              onChange={(event) => {
                updateField('monogram', event.target.value.toUpperCase());
                if (errors.monogram) {
                  setErrors((prev) => ({ ...prev, monogram: undefined }));
                }
              }}
              placeholder="KK"
              className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm font-semibold text-ui-text uppercase ${
                errors.monogram ? 'border-ui-error' : 'border-ui-border'
              }`}
            />
            {errors.monogram ? (
              <p
                id={monogramErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.monogram}
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
              value={form.heroHeadline}
              onChange={(event) => updateField('heroHeadline', event.target.value)}
              placeholder="Freshly made to order."
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
              value={form.heroBadgeLabel}
              onChange={(event) => updateField('heroBadgeLabel', event.target.value)}
              placeholder="e.g. Small-batch roasted daily"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
            value={form.heroSubtext}
            onChange={(event) => updateField('heroSubtext', event.target.value)}
            placeholder="Short welcome note or pickup and delivery details for customers."
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
              value={form.address}
              onChange={(event) => updateField('address', event.target.value)}
              placeholder="Street, building, barangay, city"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
              value={form.landmark}
              onChange={(event) => updateField('landmark', event.target.value)}
              placeholder="e.g. Ground floor beside main lobby"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
              value={form.contactPhone}
              onChange={(event) => updateField('contactPhone', event.target.value)}
              placeholder="0917 000 0000"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
              value={form.hoursText}
              onChange={(event) => updateField('hoursText', event.target.value)}
              placeholder="Daily · 8:00 AM – 9:00 PM"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
              value={form.pickupSpotLabel}
              onChange={(event) => updateField('pickupSpotLabel', event.target.value)}
              placeholder="Counter Pickup"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
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
            <input
              ref={queuePrefixRef}
              id="store-profile-queue-prefix"
              type="text"
              maxLength={4}
              value={form.queuePrefix}
              aria-invalid={Boolean(errors.queuePrefix)}
              aria-describedby={errors.queuePrefix ? queuePrefixErrorId : undefined}
              onChange={(event) => {
                updateField('queuePrefix', event.target.value.toUpperCase());
                if (errors.queuePrefix) {
                  setErrors((prev) => ({ ...prev, queuePrefix: undefined }));
                }
              }}
              placeholder="ORD"
              className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm font-semibold text-ui-text uppercase ${
                errors.queuePrefix ? 'border-ui-error' : 'border-ui-border'
              }`}
            />
            <p className="mt-1 text-[11px] text-ui-text-muted">
              2 to 4 letters/numbers (e.g. #{form.queuePrefix.trim().toUpperCase() || 'ORD'}-101).
              Older order numbers stay trackable.
            </p>
            {errors.queuePrefix ? (
              <p
                id={queuePrefixErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.queuePrefix}
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
              ref={preparingLabelRef}
              id="store-profile-preparing-label"
              type="text"
              maxLength={40}
              value={form.preparingStageLabel}
              aria-invalid={Boolean(errors.preparingStageLabel)}
              aria-describedby={errors.preparingStageLabel ? preparingLabelErrorId : undefined}
              onChange={(event) => {
                updateField('preparingStageLabel', event.target.value);
                if (errors.preparingStageLabel && event.target.value.trim()) {
                  setErrors((prev) => ({ ...prev, preparingStageLabel: undefined }));
                }
              }}
              placeholder="e.g. Preparing, Brewing, On the Grill"
              className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                errors.preparingStageLabel ? 'border-ui-error' : 'border-ui-border'
              }`}
            />
            {errors.preparingStageLabel ? (
              <p
                id={preparingLabelErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.preparingStageLabel}
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
              disabled={form.externalLinks.length >= 6}
              onClick={handleAddLink}
              className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
            >
              Add link
            </button>
          </div>

          {form.externalLinks.length > 0 ? (
            <div className="space-y-2">
              {form.externalLinks.map((link, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    type="text"
                    maxLength={40}
                    value={link.label}
                    aria-label={`External link ${index + 1} label`}
                    onChange={(event) => handleUpdateLink(index, 'label', event.target.value)}
                    placeholder="Label (e.g. Instagram)"
                    className="rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text sm:col-span-4"
                  />
                  <input
                    type="url"
                    maxLength={500}
                    value={link.url}
                    aria-label={`External link ${index + 1} URL`}
                    aria-describedby={errors.externalLinks ? linksErrorId : undefined}
                    onChange={(event) => handleUpdateLink(index, 'url', event.target.value)}
                    placeholder="https://..."
                    className="rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text sm:col-span-6"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(index)}
                    aria-label={`Remove external link ${index + 1}`}
                    className="rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-error hover:bg-ui-canvas sm:col-span-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {errors.externalLinks ? (
            <p id={linksErrorId} role="alert" className="text-xs font-semibold text-ui-error">
              {errors.externalLinks}
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

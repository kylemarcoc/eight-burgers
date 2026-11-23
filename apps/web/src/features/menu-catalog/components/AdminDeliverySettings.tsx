import { useId, useRef, useState, type SubmitEvent } from 'react';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import {
  estimateDeliveryEtaMinutes,
  estimateDeliveryFeePhp,
  formatPhp,
} from '@/shared/shop/shop-storage';
import type { DeliveryPricingConfig, DeliveryPricingPatch } from '@/shared/shop/types';
import { useCatalogQuery, useDeliveryPricingMutations } from '../hooks/useCatalog';

const EMPTY_PRICING: DeliveryPricingConfig = {
  deliveryEnabled: true,
  baseFeePhp: 35,
  perKmRatePhp: 10,
  maxDistanceKm: 25,
  freeDeliveryMinSubtotalPhp: 500,
};

const PREVIEW_DISTANCES_KM = [1, 3, 5, 10, 15, 20] as const;

type PricingFormState = {
  deliveryEnabled: boolean;
  baseFeePhp: string;
  perKmRatePhp: string;
  maxDistanceKm: string;
  thresholdEnabled: boolean;
  thresholdInput: string;
};

type PricingFormErrors = {
  baseFeePhp?: string;
  perKmRatePhp?: string;
  maxDistanceKm?: string;
  thresholdInput?: string;
};

function pricingToFormState(pricing: DeliveryPricingConfig): PricingFormState {
  return {
    deliveryEnabled: pricing.deliveryEnabled,
    baseFeePhp: String(pricing.baseFeePhp),
    perKmRatePhp: String(pricing.perKmRatePhp),
    maxDistanceKm: String(pricing.maxDistanceKm),
    thresholdEnabled: pricing.freeDeliveryMinSubtotalPhp !== null,
    thresholdInput: String(pricing.freeDeliveryMinSubtotalPhp ?? 500),
  };
}

function getPricingSignature(pricing: DeliveryPricingConfig): string {
  return JSON.stringify([
    pricing.deliveryEnabled,
    pricing.baseFeePhp,
    pricing.perKmRatePhp,
    pricing.maxDistanceKm,
    pricing.freeDeliveryMinSubtotalPhp,
    pricing.version ?? null,
  ]);
}

export type AdminDeliverySettingsProps = {
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function AdminDeliverySettings({ onStatusMessage }: AdminDeliverySettingsProps) {
  const catalogQuery = useCatalogQuery();
  const deliveryPricing = catalogQuery.data?.deliveryPricing ?? EMPTY_PRICING;
  const { updateDeliveryPricing, resetDeliveryPricing } = useDeliveryPricingMutations();

  const [form, setForm] = useState<PricingFormState>(() => pricingToFormState(deliveryPricing));
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>(deliveryPricing.version);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState<PricingFormErrors>({});
  const [editConflict, setEditConflict] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [lastSyncedSignature, setLastSyncedSignature] = useState(() =>
    getPricingSignature(deliveryPricing),
  );

  const currentSignature = getPricingSignature(deliveryPricing);
  if (currentSignature !== lastSyncedSignature) {
    setLastSyncedSignature(currentSignature);
    if (!isDirty) {
      setForm(pricingToFormState(deliveryPricing));
      setLoadedVersion(deliveryPricing.version);
      setErrors({});
      setEditConflict(false);
    }
  }

  const baseFeeInputRef = useRef<HTMLInputElement | null>(null);
  const perKmRateInputRef = useRef<HTMLInputElement | null>(null);
  const maxDistanceInputRef = useRef<HTMLInputElement | null>(null);
  const thresholdInputRef = useRef<HTMLInputElement | null>(null);

  const baseFeeErrorId = useId();
  const perKmRateErrorId = useId();
  const maxDistanceErrorId = useId();
  const thresholdErrorId = useId();

  async function reloadLatestSettings() {
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.deliveryPricing ?? deliveryPricing;
    setForm(pricingToFormState(latest));
    setLoadedVersion(latest.version);
    setLastSyncedSignature(getPricingSignature(latest));
    setIsDirty(false);
    setEditConflict(false);
    setErrors({});
    onStatusMessage('Reloaded latest delivery pricing settings.');
  }

  async function handlePricingSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedBase = Number(form.baseFeePhp);
    const parsedRate = Number(form.perKmRatePhp);
    const parsedMaxDist = Number(form.maxDistanceKm);
    const parsedThreshold = Number(form.thresholdInput);

    const nextErrors: PricingFormErrors = {};
    if (
      form.baseFeePhp.trim() === '' ||
      !Number.isFinite(parsedBase) ||
      parsedBase < 0 ||
      parsedBase > 10000
    ) {
      nextErrors.baseFeePhp = 'Enter a base fee between ₱0 and ₱10,000.';
    }
    if (
      form.perKmRatePhp.trim() === '' ||
      !Number.isFinite(parsedRate) ||
      parsedRate < 0 ||
      parsedRate > 1000
    ) {
      nextErrors.perKmRatePhp = 'Enter a per-km rate between ₱0 and ₱1,000.';
    }
    if (
      form.maxDistanceKm.trim() === '' ||
      !Number.isFinite(parsedMaxDist) ||
      parsedMaxDist < 0.1 ||
      parsedMaxDist > 200
    ) {
      nextErrors.maxDistanceKm = 'Enter a max distance between 0.1 km and 200 km.';
    }
    if (
      form.thresholdEnabled &&
      (form.thresholdInput.trim() === '' ||
        !Number.isFinite(parsedThreshold) ||
        parsedThreshold <= 0 ||
        parsedThreshold > 100000)
    ) {
      nextErrors.thresholdInput = 'Enter a minimum subtotal between ₱1 and ₱100,000.';
    }

    if (
      nextErrors.baseFeePhp ||
      nextErrors.perKmRatePhp ||
      nextErrors.maxDistanceKm ||
      nextErrors.thresholdInput
    ) {
      setErrors(nextErrors);
      if (nextErrors.baseFeePhp) {
        baseFeeInputRef.current?.focus();
      } else if (nextErrors.perKmRatePhp) {
        perKmRateInputRef.current?.focus();
      } else if (nextErrors.maxDistanceKm) {
        maxDistanceInputRef.current?.focus();
      } else if (nextErrors.thresholdInput) {
        thresholdInputRef.current?.focus();
      }
      return;
    }

    const patch: DeliveryPricingPatch = {
      deliveryEnabled: form.deliveryEnabled,
      baseFeePhp: Math.round(parsedBase),
      perKmRatePhp: Math.round(parsedRate),
      maxDistanceKm: Math.round(parsedMaxDist * 10) / 10,
      freeDeliveryMinSubtotalPhp: form.thresholdEnabled ? Math.round(parsedThreshold) : null,
      expectedVersion: loadedVersion ?? deliveryPricing.version,
    };

    try {
      const updated = await updateDeliveryPricing.mutateAsync(patch);
      setErrors({});
      setEditConflict(false);
      setIsDirty(false);
      setForm(pricingToFormState(updated));
      setLoadedVersion(updated.version);
      setLastSyncedSignature(getPricingSignature(updated));
      const thresholdSummary =
        updated.freeDeliveryMinSubtotalPhp !== null
          ? `Free delivery at ${formatPhp(updated.freeDeliveryMinSubtotalPhp)}+`
          : 'Free delivery disabled';
      onStatusMessage(
        updated.deliveryEnabled
          ? `Saved delivery pricing: ${formatPhp(updated.baseFeePhp)} base + ${formatPhp(updated.perKmRatePhp)}/km up to ${updated.maxDistanceKm} km (${thresholdSummary}).`
          : 'Delivery paused. Only Kiosk Pickup orders will be accepted.',
      );
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setEditConflict(true);
      }
      onStatusMessage(getApiErrorMessage(error, 'Failed to save delivery settings.'), 'error');
    }
  }

  const previewBase = Number(form.baseFeePhp);
  const previewRate = Number(form.perKmRatePhp);
  const previewMaxDist = Number(form.maxDistanceKm);
  const previewThreshold = Number(form.thresholdInput);
  const isPreviewValid =
    form.baseFeePhp.trim() !== '' &&
    form.perKmRatePhp.trim() !== '' &&
    form.maxDistanceKm.trim() !== '' &&
    Number.isFinite(previewBase) &&
    Number.isFinite(previewRate) &&
    Number.isFinite(previewMaxDist) &&
    previewBase >= 0 &&
    previewRate >= 0 &&
    previewMaxDist >= 0.1;

  return (
    <section aria-labelledby="delivery-pricing-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="delivery-pricing-heading" className="text-lg font-bold text-ui-text">
              Delivery Pricing
            </h2>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                deliveryPricing.deliveryEnabled
                  ? 'bg-ui-surface-muted text-ui-accent'
                  : 'border border-ui-error/40 bg-ui-error/10 text-ui-error'
              }`}
            >
              {deliveryPricing.deliveryEnabled ? 'Accepting delivery' : 'Paused'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ui-text-muted">
            Configure the base fee, per-kilometer rate, maximum coverage radius, and free-delivery
            threshold used at checkout.
          </p>
        </div>

        {confirmReset ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={resetDeliveryPricing.isPending}
              onClick={() => {
                void resetDeliveryPricing
                  .mutateAsync()
                  .then((restored) => {
                    setForm(pricingToFormState(restored));
                    setLoadedVersion(restored.version);
                    setLastSyncedSignature(getPricingSignature(restored));
                    setIsDirty(false);
                    setEditConflict(false);
                    setConfirmReset(false);
                    setErrors({});
                    onStatusMessage('Restored default distance-formula delivery pricing.');
                  })
                  .catch((error: unknown) => {
                    onStatusMessage(
                      getApiErrorMessage(error, 'Failed to restore default delivery pricing.'),
                      'error',
                    );
                  });
              }}
              className="rounded-lg bg-ui-error px-3 py-1.5 text-xs font-semibold text-ui-on-error hover:opacity-90 disabled:opacity-60"
            >
              Confirm restore
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="shrink-0 rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
          >
            Restore Defaults
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          noValidate
          onSubmit={(event) => void handlePricingSubmit(event)}
          className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-7"
        >
          {editConflict ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
            >
              <span>
                Delivery settings changed on another device. Reload latest values before saving.
              </span>
              <button
                type="button"
                onClick={() => void reloadLatestSettings()}
                className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
              >
                Reload latest settings
              </button>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2.5 text-sm font-semibold text-ui-text">
            <input
              id="admin-delivery-enabled"
              type="checkbox"
              checked={form.deliveryEnabled}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, deliveryEnabled: event.target.checked }));
                setIsDirty(true);
              }}
              className="accent-ui-accent h-4 w-4 rounded"
            />
            <span>Accepting delivery orders</span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="admin-delivery-base-fee"
                className="block text-xs font-semibold text-ui-text"
              >
                Base Fee (₱)
              </label>
              <input
                ref={baseFeeInputRef}
                id="admin-delivery-base-fee"
                type="number"
                min={0}
                max={10000}
                step={1}
                value={form.baseFeePhp}
                aria-invalid={Boolean(errors.baseFeePhp)}
                aria-describedby={errors.baseFeePhp ? baseFeeErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, baseFeePhp: value }));
                  setIsDirty(true);
                  const numeric = Number(value);
                  if (
                    errors.baseFeePhp &&
                    value.trim() !== '' &&
                    Number.isFinite(numeric) &&
                    numeric >= 0 &&
                    numeric <= 10000
                  ) {
                    setErrors((prev) => ({ ...prev, baseFeePhp: undefined }));
                  }
                }}
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                  errors.baseFeePhp ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {errors.baseFeePhp ? (
                <p
                  id={baseFeeErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.baseFeePhp}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="admin-delivery-per-km"
                className="block text-xs font-semibold text-ui-text"
              >
                Per-km Rate (₱/km)
              </label>
              <input
                ref={perKmRateInputRef}
                id="admin-delivery-per-km"
                type="number"
                min={0}
                max={1000}
                step={1}
                value={form.perKmRatePhp}
                aria-invalid={Boolean(errors.perKmRatePhp)}
                aria-describedby={errors.perKmRatePhp ? perKmRateErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, perKmRatePhp: value }));
                  setIsDirty(true);
                  const numeric = Number(value);
                  if (
                    errors.perKmRatePhp &&
                    value.trim() !== '' &&
                    Number.isFinite(numeric) &&
                    numeric >= 0 &&
                    numeric <= 1000
                  ) {
                    setErrors((prev) => ({ ...prev, perKmRatePhp: undefined }));
                  }
                }}
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                  errors.perKmRatePhp ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {errors.perKmRatePhp ? (
                <p
                  id={perKmRateErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.perKmRatePhp}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="admin-delivery-max-distance"
                className="block text-xs font-semibold text-ui-text"
              >
                Max Distance (km)
              </label>
              <input
                ref={maxDistanceInputRef}
                id="admin-delivery-max-distance"
                type="number"
                min={0.1}
                max={200}
                step={0.1}
                value={form.maxDistanceKm}
                aria-invalid={Boolean(errors.maxDistanceKm)}
                aria-describedby={errors.maxDistanceKm ? maxDistanceErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, maxDistanceKm: value }));
                  setIsDirty(true);
                  const numeric = Number(value);
                  if (
                    errors.maxDistanceKm &&
                    value.trim() !== '' &&
                    Number.isFinite(numeric) &&
                    numeric >= 0.1 &&
                    numeric <= 200
                  ) {
                    setErrors((prev) => ({ ...prev, maxDistanceKm: undefined }));
                  }
                }}
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                  errors.maxDistanceKm ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {errors.maxDistanceKm ? (
                <p
                  id={maxDistanceErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.maxDistanceKm}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 border-t border-ui-border pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ui-text">
              <input
                id="admin-free-delivery-enabled"
                type="checkbox"
                checked={form.thresholdEnabled}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, thresholdEnabled: event.target.checked }));
                  setIsDirty(true);
                  setErrors((prev) => ({ ...prev, thresholdInput: undefined }));
                }}
                className="accent-ui-accent h-4 w-4 rounded"
              />
              <span>Free delivery on orders meeting minimum subtotal</span>
            </label>

            <div>
              <label
                htmlFor="admin-free-delivery-min"
                className="block text-xs font-semibold text-ui-text"
              >
                Min. Subtotal (₱)
              </label>
              <input
                ref={thresholdInputRef}
                id="admin-free-delivery-min"
                type="number"
                min={1}
                max={100000}
                step={1}
                disabled={!form.thresholdEnabled}
                value={form.thresholdInput}
                aria-invalid={Boolean(errors.thresholdInput)}
                aria-describedby={errors.thresholdInput ? thresholdErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, thresholdInput: value }));
                  setIsDirty(true);
                  const numeric = Number(value);
                  if (
                    errors.thresholdInput &&
                    Number.isFinite(numeric) &&
                    numeric > 0 &&
                    numeric <= 100000
                  ) {
                    setErrors((prev) => ({ ...prev, thresholdInput: undefined }));
                  }
                }}
                className={`mt-1 w-40 rounded-xl border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text tabular-nums disabled:opacity-50 ${
                  errors.thresholdInput ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {errors.thresholdInput ? (
                <p
                  id={thresholdErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.thresholdInput}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="submit"
            disabled={updateDeliveryPricing.isPending}
            className="w-full rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
          >
            {updateDeliveryPricing.isPending ? 'Saving…' : 'Save Delivery Settings'}
          </button>
        </form>

        <div className="space-y-3 rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-5">
          <div>
            <h3 className="text-sm font-bold text-ui-text">Live Formula Preview</h3>
            <p className="mt-0.5 text-xs text-ui-text-muted tabular-nums">
              {isPreviewValid
                ? `${formatPhp(Math.round(previewBase))} base + ${formatPhp(Math.round(previewRate))}/km · up to ${Math.round(previewMaxDist * 10) / 10} km`
                : 'Enter valid numbers to preview delivery distance rates.'}
            </p>
          </div>

          {!form.deliveryEnabled ? (
            <p className="rounded-xl border border-ui-error/40 bg-ui-error/10 px-3 py-2 text-xs text-ui-error">
              Delivery orders are currently paused in this configuration.
            </p>
          ) : null}

          <ul className="divide-y divide-ui-border rounded-xl border border-ui-border bg-ui-canvas text-xs">
            {PREVIEW_DISTANCES_KM.map((km) => {
              const withinRange = isPreviewValid && km <= Math.round(previewMaxDist * 10) / 10;
              return (
                <li
                  key={km}
                  className="flex items-center justify-between gap-2 px-3 py-2 tabular-nums"
                >
                  <span className="font-medium text-ui-text">{km} km road distance</span>
                  {!isPreviewValid ? (
                    <span className="text-ui-text-muted">—</span>
                  ) : withinRange ? (
                    <span className="font-semibold text-ui-accent">
                      {formatPhp(
                        estimateDeliveryFeePhp(
                          km,
                          Math.round(previewBase),
                          Math.round(previewRate),
                        ),
                      )}{' '}
                      ·{' '}
                      <span className="font-normal text-ui-text-muted">
                        {estimateDeliveryEtaMinutes(km)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-semibold text-ui-error">Out of range</span>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-ui-text-muted">
            {form.thresholdEnabled &&
            Number.isFinite(previewThreshold) &&
            previewThreshold > 0 &&
            previewThreshold <= 100000
              ? `Free delivery unlocked on orders ${formatPhp(Math.round(previewThreshold))} and above.`
              : 'Free delivery threshold is disabled — delivery fee applies to all distances.'}
          </p>
        </div>
      </div>
    </section>
  );
}

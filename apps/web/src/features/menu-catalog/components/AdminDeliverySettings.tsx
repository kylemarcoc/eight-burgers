import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import {
  calculateDeliveryQuote,
  estimateDeliveryEtaMinutes,
  estimateDeliveryFeePhp,
  formatPhp,
  isValidCoordinates,
} from '@/shared/shop/shop-storage';
import type { DeliveryPricingConfig, DeliveryPricingPatch } from '@/shared/shop/types';
import { useCatalogQuery, useDeliveryPricingMutations } from '../hooks/useCatalog';
import {
  createDeliveryPricingFormSchema,
  type DeliveryPricingFormValues,
} from '../schemas/delivery-pricing-form.schema';

const EMPTY_PRICING: DeliveryPricingConfig = {
  deliveryEnabled: false,
  baseFeePhp: 35,
  perKmRatePhp: 10,
  maxDistanceKm: 25,
  freeDeliveryMinSubtotalPhp: 500,
  originCoords: null,
};

const PREVIEW_DISTANCES_KM = [1, 3, 5, 10, 15, 20] as const;

function pricingToFormState(pricing: DeliveryPricingConfig): DeliveryPricingFormValues {
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
    pricing.originCoords,
    pricing.version ?? null,
  ]);
}

export type AdminDeliverySettingsProps = {
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function AdminDeliverySettings({ onStatusMessage }: AdminDeliverySettingsProps) {
  const catalogQuery = useCatalogQuery();
  const deliveryPricing = catalogQuery.data?.deliveryPricing ?? EMPTY_PRICING;
  const hasOriginPin = isValidCoordinates(deliveryPricing.originCoords);
  const { updateDeliveryPricing, resetDeliveryPricing } = useDeliveryPricingMutations();

  const {
    register,
    control,
    handleSubmit,
    reset,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<DeliveryPricingFormValues>({
    defaultValues: pricingToFormState(deliveryPricing),
    resolver: (values, ctx, options) =>
      zodResolver(createDeliveryPricingFormSchema({ hasOriginPin }))(values, ctx, options),
  });

  const watched = useWatch({ control });
  const deliveryEnabled = watched.deliveryEnabled ?? deliveryPricing.deliveryEnabled;
  const baseFeePhp = watched.baseFeePhp ?? String(deliveryPricing.baseFeePhp);
  const perKmRatePhp = watched.perKmRatePhp ?? String(deliveryPricing.perKmRatePhp);
  const maxDistanceKm = watched.maxDistanceKm ?? String(deliveryPricing.maxDistanceKm);
  const thresholdEnabled =
    watched.thresholdEnabled ?? deliveryPricing.freeDeliveryMinSubtotalPhp !== null;
  const thresholdInput =
    watched.thresholdInput ?? String(deliveryPricing.freeDeliveryMinSubtotalPhp ?? 500);

  const loadedVersionRef = useRef<number | undefined>(deliveryPricing.version);
  const [editConflict, setEditConflict] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const lastSyncedSignatureRef = useRef(getPricingSignature(deliveryPricing));

  const currentSignature = getPricingSignature(deliveryPricing);

  useEffect(() => {
    if (!isDirty && currentSignature !== lastSyncedSignatureRef.current) {
      lastSyncedSignatureRef.current = currentSignature;
      reset(pricingToFormState(deliveryPricing));
      loadedVersionRef.current = deliveryPricing.version;
      setEditConflict(false);
    }
  }, [currentSignature, deliveryPricing, isDirty, reset]);

  const deliveryEnabledErrorId = useId();
  const baseFeeErrorId = useId();
  const perKmRateErrorId = useId();
  const maxDistanceErrorId = useId();
  const thresholdErrorId = useId();

  async function reloadLatestSettings() {
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.deliveryPricing ?? deliveryPricing;
    lastSyncedSignatureRef.current = getPricingSignature(latest);
    reset(pricingToFormState(latest));
    loadedVersionRef.current = latest.version;
    setEditConflict(false);
    onStatusMessage('Reloaded latest delivery pricing settings.');
  }

  async function onSubmit(values: DeliveryPricingFormValues) {
    const patch: DeliveryPricingPatch = {
      deliveryEnabled: values.deliveryEnabled,
      baseFeePhp: Math.round(Number(values.baseFeePhp)),
      perKmRatePhp: Math.round(Number(values.perKmRatePhp)),
      maxDistanceKm: Math.round(Number(values.maxDistanceKm) * 10) / 10,
      freeDeliveryMinSubtotalPhp: values.thresholdEnabled
        ? Math.round(Number(values.thresholdInput))
        : null,
      expectedVersion: loadedVersionRef.current ?? deliveryPricing.version,
    };

    try {
      const updated = await updateDeliveryPricing.mutateAsync(patch);
      lastSyncedSignatureRef.current = getPricingSignature(updated);
      reset(pricingToFormState(updated));
      loadedVersionRef.current = updated.version;
      setEditConflict(false);
      const thresholdSummary =
        updated.freeDeliveryMinSubtotalPhp !== null
          ? `Free delivery at ${formatPhp(updated.freeDeliveryMinSubtotalPhp)}+`
          : 'Free delivery disabled';
      onStatusMessage(
        updated.deliveryEnabled
          ? `Saved delivery pricing: ${formatPhp(updated.baseFeePhp)} base + ${formatPhp(updated.perKmRatePhp)}/km up to ${updated.maxDistanceKm} km (${thresholdSummary}).`
          : 'Delivery paused. Only pickup orders will be accepted.',
      );
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setEditConflict(true);
      }
      onStatusMessage(getApiErrorMessage(error, 'Failed to save delivery settings.'), 'error');
    }
  }

  const previewBase = Number(baseFeePhp);
  const previewRate = Number(perKmRatePhp);
  const previewMaxDist = Number(maxDistanceKm);
  const previewThreshold = Number(thresholdInput);
  const isPreviewValid =
    baseFeePhp.trim() !== '' &&
    perKmRatePhp.trim() !== '' &&
    maxDistanceKm.trim() !== '' &&
    Number.isFinite(previewBase) &&
    Number.isFinite(previewRate) &&
    Number.isFinite(previewMaxDist) &&
    previewBase >= 0 &&
    previewRate >= 0 &&
    previewMaxDist >= 0.1;

  const previewQuote = calculateDeliveryQuote({
    fulfillment: 'delivery',
    subtotalPhp: 0,
    deliveryPricing: {
      ...deliveryPricing,
      deliveryEnabled,
      baseFeePhp: isPreviewValid ? Math.round(previewBase) : deliveryPricing.baseFeePhp,
      perKmRatePhp: isPreviewValid ? Math.round(previewRate) : deliveryPricing.perKmRatePhp,
      maxDistanceKm: isPreviewValid
        ? Math.round(previewMaxDist * 10) / 10
        : deliveryPricing.maxDistanceKm,
      freeDeliveryMinSubtotalPhp:
        thresholdEnabled && Number.isFinite(previewThreshold) && previewThreshold > 0
          ? Math.round(previewThreshold)
          : null,
    },
    storeOrigin: deliveryPricing.originCoords,
  });

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
                deliveryPricing.deliveryEnabled && hasOriginPin
                  ? 'bg-ui-surface-muted text-ui-accent'
                  : 'border border-ui-error/40 bg-ui-error/10 text-ui-error'
              }`}
            >
              {!hasOriginPin
                ? 'Origin pin required'
                : deliveryPricing.deliveryEnabled
                  ? 'Accepting delivery'
                  : 'Paused'}
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
                    lastSyncedSignatureRef.current = getPricingSignature(restored);
                    reset(pricingToFormState(restored));
                    loadedVersionRef.current = restored.version;
                    setEditConflict(false);
                    setConfirmReset(false);
                    onStatusMessage('Restored default distance-formula delivery pricing.');
                  })
                  .catch((error: unknown) => {
                    setConfirmReset(false);
                    onStatusMessage(
                      isApiError(error) && error.code === 'DEMO_RESET_DISABLED'
                        ? getApiErrorMessage(error, 'Demo reset is disabled in this environment.')
                        : getApiErrorMessage(error, 'Failed to restore default delivery pricing.'),
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
          onSubmit={(event) => {
            if (updateDeliveryPricing.isPending) {
              event.preventDefault();
              return;
            }
            void handleSubmit(onSubmit)(event);
          }}
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

          {!hasOriginPin ? (
            <p
              role="alert"
              className="rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs font-medium text-ui-error"
            >
              Shop location pin is not configured yet. Set your shop location pin in Store Settings
              before enabling delivery.
            </p>
          ) : null}

          <div>
            <label
              className={`flex items-center gap-2 rounded-xl border bg-ui-surface-muted px-3 py-2.5 text-sm font-semibold text-ui-text ${
                errors.deliveryEnabled ? 'border-ui-error' : 'border-ui-border'
              } ${
                !hasOriginPin && !deliveryEnabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer'
              }`}
            >
              <input
                id="admin-delivery-enabled"
                type="checkbox"
                disabled={!hasOriginPin && !deliveryEnabled}
                aria-invalid={Boolean(errors.deliveryEnabled)}
                aria-describedby={errors.deliveryEnabled ? deliveryEnabledErrorId : undefined}
                className="accent-ui-accent h-4 w-4 rounded"
                {...register('deliveryEnabled', {
                  onChange: () => clearErrors('deliveryEnabled'),
                })}
              />
              <span>Accepting delivery orders</span>
            </label>
            {errors.deliveryEnabled ? (
              <p
                id={deliveryEnabledErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {errors.deliveryEnabled.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="admin-delivery-base-fee"
                className="block text-xs font-semibold text-ui-text"
              >
                Base Fee (₱)
              </label>
              <input
                id="admin-delivery-base-fee"
                type="number"
                min={0}
                max={10000}
                step={1}
                aria-invalid={Boolean(errors.baseFeePhp)}
                aria-describedby={errors.baseFeePhp ? baseFeeErrorId : undefined}
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                  errors.baseFeePhp ? 'border-ui-error' : 'border-ui-border'
                }`}
                {...register('baseFeePhp')}
              />
              {errors.baseFeePhp ? (
                <p
                  id={baseFeeErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.baseFeePhp.message}
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
                id="admin-delivery-per-km"
                type="number"
                min={0}
                max={1000}
                step={1}
                aria-invalid={Boolean(errors.perKmRatePhp)}
                aria-describedby={errors.perKmRatePhp ? perKmRateErrorId : undefined}
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                  errors.perKmRatePhp ? 'border-ui-error' : 'border-ui-border'
                }`}
                {...register('perKmRatePhp')}
              />
              {errors.perKmRatePhp ? (
                <p
                  id={perKmRateErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.perKmRatePhp.message}
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
                id="admin-delivery-max-distance"
                type="number"
                min={0.1}
                max={200}
                step={0.1}
                aria-invalid={Boolean(errors.maxDistanceKm)}
                aria-describedby={errors.maxDistanceKm ? maxDistanceErrorId : undefined}
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                  errors.maxDistanceKm ? 'border-ui-error' : 'border-ui-border'
                }`}
                {...register('maxDistanceKm')}
              />
              {errors.maxDistanceKm ? (
                <p
                  id={maxDistanceErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.maxDistanceKm.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 border-t border-ui-border pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ui-text">
              <input
                id="admin-free-delivery-enabled"
                type="checkbox"
                className="accent-ui-accent h-4 w-4 rounded"
                {...register('thresholdEnabled', {
                  onChange: () => clearErrors('thresholdInput'),
                })}
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
                id="admin-free-delivery-min"
                type="number"
                min={1}
                max={100000}
                step={1}
                disabled={!thresholdEnabled}
                aria-invalid={Boolean(errors.thresholdInput)}
                aria-describedby={errors.thresholdInput ? thresholdErrorId : undefined}
                className={`mt-1 w-40 rounded-xl border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text tabular-nums disabled:opacity-50 ${
                  errors.thresholdInput ? 'border-ui-error' : 'border-ui-border'
                }`}
                {...register('thresholdInput')}
              />
              {errors.thresholdInput ? (
                <p
                  id={thresholdErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {errors.thresholdInput.message}
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
            <p className="mt-1 text-[11px] text-ui-text-muted tabular-nums">
              {deliveryPricing.originCoords
                ? `Origin pin: ${deliveryPricing.originCoords.lat.toFixed(4)}, ${deliveryPricing.originCoords.lng.toFixed(4)}`
                : 'Origin pin: not configured'}
            </p>
          </div>

          {!previewQuote.available ? (
            <p className="rounded-xl border border-ui-error/40 bg-ui-error/10 px-3 py-2 text-xs text-ui-error">
              {!hasOriginPin
                ? 'Set a shop location pin in Store Settings before delivery quotes can activate.'
                : 'Delivery orders are currently paused in this configuration.'}
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
            {thresholdEnabled &&
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

import { useId, useRef, useState, type FormEvent } from 'react';
import { formatPhp } from '@/shared/shop/shop-storage';
import { useShopActions, useShopDeliveryPricing } from '@/shared/store/useShopStore';
import type { DeliveryZone, DeliveryZoneInput } from '@/shared/shop/types';

type ZoneFormState = {
  name: string;
  areas: string;
  maxDistanceKm: string;
  feePhp: string;
  etaMinutes: string;
  enabled: boolean;
};

type ZoneFormErrors = {
  name?: string;
  maxDistanceKm?: string;
  feePhp?: string;
  etaMinutes?: string;
};

const EMPTY_ZONE_FORM: ZoneFormState = {
  name: '',
  areas: '',
  maxDistanceKm: '8',
  feePhp: '65',
  etaMinutes: '25–40 min',
  enabled: true,
};

function zoneToFormState(zone: DeliveryZone): ZoneFormState {
  return {
    name: zone.name,
    areas: zone.areas,
    maxDistanceKm: String(zone.maxDistanceKm),
    feePhp: String(zone.feePhp),
    etaMinutes: zone.etaMinutes,
    enabled: zone.enabled,
  };
}

export type AdminDeliverySettingsProps = {
  onStatusMessage: (message: string) => void;
};

export function AdminDeliverySettings({ onStatusMessage }: AdminDeliverySettingsProps) {
  const deliveryPricing = useShopDeliveryPricing();
  const {
    setFreeDeliveryThreshold,
    createDeliveryZone,
    updateDeliveryZone,
    toggleDeliveryZone,
    deleteDeliveryZone,
    resetDeliveryPricing,
  } = useShopActions();

  const [thresholdEnabled, setThresholdEnabled] = useState(
    deliveryPricing.freeDeliveryMinSubtotalPhp !== null,
  );
  const [thresholdInput, setThresholdInput] = useState(
    String(deliveryPricing.freeDeliveryMinSubtotalPhp ?? 500),
  );
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [lastSyncedThreshold, setLastSyncedThreshold] = useState(
    deliveryPricing.freeDeliveryMinSubtotalPhp,
  );

  if (deliveryPricing.freeDeliveryMinSubtotalPhp !== lastSyncedThreshold) {
    setLastSyncedThreshold(deliveryPricing.freeDeliveryMinSubtotalPhp);
    setThresholdEnabled(deliveryPricing.freeDeliveryMinSubtotalPhp !== null);
    if (deliveryPricing.freeDeliveryMinSubtotalPhp !== null) {
      setThresholdInput(String(deliveryPricing.freeDeliveryMinSubtotalPhp));
    }
    setThresholdError(null);
  }

  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState<ZoneFormState>(EMPTY_ZONE_FORM);
  const [zoneErrors, setZoneErrors] = useState<ZoneFormErrors>({});
  const [confirmDeleteZoneId, setConfirmDeleteZoneId] = useState<string | null>(null);
  const [confirmResetZones, setConfirmResetZones] = useState(false);

  const thresholdInputRef = useRef<HTMLInputElement | null>(null);
  const zoneNameInputRef = useRef<HTMLInputElement | null>(null);
  const zoneRadiusInputRef = useRef<HTMLInputElement | null>(null);
  const zoneFeeInputRef = useRef<HTMLInputElement | null>(null);
  const zoneEtaInputRef = useRef<HTMLInputElement | null>(null);

  const thresholdErrorId = useId();
  const zoneNameErrorId = useId();
  const zoneRadiusErrorId = useId();
  const zoneFeeErrorId = useId();
  const zoneEtaErrorId = useId();

  const sortedZones = [...deliveryPricing.zones].sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
  const activeZoneCount = deliveryPricing.zones.filter((zone) => zone.enabled).length;

  function handleThresholdSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thresholdEnabled) {
      setThresholdError(null);
      setFreeDeliveryThreshold(null);
      onStatusMessage('Disabled free delivery minimum order threshold.');
      return;
    }

    const parsed = Number(thresholdInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setThresholdError('Enter a minimum subtotal greater than 0 pesos.');
      thresholdInputRef.current?.focus();
      return;
    }

    const rounded = Math.round(parsed);
    setThresholdError(null);
    setFreeDeliveryThreshold(rounded);
    onStatusMessage(`Free delivery unlocked on orders ${formatPhp(rounded)} and above.`);
  }

  function startEditingZone(zone: DeliveryZone) {
    setEditingZoneId(zone.id);
    setZoneForm(zoneToFormState(zone));
    setZoneErrors({});
    setConfirmDeleteZoneId(null);
    zoneNameInputRef.current?.focus();
  }

  function cancelEditingZone() {
    setEditingZoneId(null);
    setZoneForm(EMPTY_ZONE_FORM);
    setZoneErrors({});
  }

  function handleZoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = zoneForm.name.trim();
    const parsedRadius = Number(zoneForm.maxDistanceKm);
    const parsedFee = Number(zoneForm.feePhp);
    const trimmedEta = zoneForm.etaMinutes.trim();

    const nextErrors: ZoneFormErrors = {};
    if (!trimmedName) {
      nextErrors.name = 'Enter a delivery zone name.';
    }
    if (
      zoneForm.maxDistanceKm.trim() === '' ||
      !Number.isFinite(parsedRadius) ||
      parsedRadius <= 0
    ) {
      nextErrors.maxDistanceKm = 'Enter a max distance greater than 0 km.';
    }
    if (zoneForm.feePhp.trim() === '' || !Number.isFinite(parsedFee) || parsedFee < 0) {
      nextErrors.feePhp = 'Enter a delivery fee of 0 pesos or more.';
    }
    if (!trimmedEta) {
      nextErrors.etaMinutes = 'Enter an estimated delivery time (e.g. 20–35 min).';
    }

    if (nextErrors.name || nextErrors.maxDistanceKm || nextErrors.feePhp || nextErrors.etaMinutes) {
      setZoneErrors(nextErrors);
      if (nextErrors.name) {
        zoneNameInputRef.current?.focus();
      } else if (nextErrors.maxDistanceKm) {
        zoneRadiusInputRef.current?.focus();
      } else if (nextErrors.feePhp) {
        zoneFeeInputRef.current?.focus();
      } else if (nextErrors.etaMinutes) {
        zoneEtaInputRef.current?.focus();
      }
      return;
    }

    const payload: DeliveryZoneInput = {
      name: trimmedName,
      areas: zoneForm.areas.trim() || 'Metro Manila',
      maxDistanceKm: Math.round(parsedRadius * 10) / 10,
      feePhp: Math.round(parsedFee),
      etaMinutes: trimmedEta,
      enabled: zoneForm.enabled,
    };

    if (editingZoneId) {
      updateDeliveryZone(editingZoneId, payload);
      onStatusMessage(`Updated delivery zone "${trimmedName}" (${formatPhp(payload.feePhp)}).`);
      setEditingZoneId(null);
    } else {
      createDeliveryZone(payload);
      onStatusMessage(`Added delivery zone "${trimmedName}" (${formatPhp(payload.feePhp)}).`);
    }

    setZoneErrors({});
    setZoneForm(EMPTY_ZONE_FORM);
  }

  return (
    <section aria-labelledby="delivery-pricing-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="delivery-pricing-heading" className="text-lg font-bold text-ui-text">
            Delivery Zones &amp; Pricing ({activeZoneCount}/{deliveryPricing.zones.length} active)
          </h2>
          <p className="mt-0.5 text-xs text-ui-text-muted">
            Configure Metro Manila delivery zone rates, ETAs, and free-delivery threshold shown at
            checkout.
          </p>
        </div>

        {confirmResetZones ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetDeliveryPricing();
                cancelEditingZone();
                setConfirmDeleteZoneId(null);
                setConfirmResetZones(false);
                onStatusMessage('Restored default Metro Manila delivery zones and threshold.');
              }}
              className="rounded-lg bg-ui-error px-3 py-1.5 text-xs font-semibold text-ui-on-error hover:opacity-90"
            >
              Confirm restore zones
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetZones(false)}
              className="rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmResetZones(true)}
            className="shrink-0 rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
          >
            Restore Default Zones
          </button>
        )}
      </div>

      <form
        noValidate
        onSubmit={handleThresholdSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-ui-border bg-ui-surface p-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ui-text">
            <input
              type="checkbox"
              checked={thresholdEnabled}
              onChange={(event) => {
                setThresholdEnabled(event.target.checked);
                setThresholdError(null);
              }}
              className="accent-ui-accent h-4 w-4 rounded"
            />
            <span>Free delivery on orders meeting minimum subtotal</span>
          </label>
          <p className="text-xs text-ui-text-muted">
            {deliveryPricing.freeDeliveryMinSubtotalPhp !== null
              ? `Currently waiving delivery fees for orders ${formatPhp(deliveryPricing.freeDeliveryMinSubtotalPhp)} and above.`
              : 'Currently disabled — customers always pay their selected zone fee.'}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2 sm:shrink-0">
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
              step={1}
              disabled={!thresholdEnabled}
              value={thresholdInput}
              aria-invalid={Boolean(thresholdError)}
              aria-describedby={thresholdError ? thresholdErrorId : undefined}
              onChange={(event) => {
                setThresholdInput(event.target.value);
                const numeric = Number(event.target.value);
                if (thresholdError && Number.isFinite(numeric) && numeric > 0) {
                  setThresholdError(null);
                }
              }}
              className={`mt-1 w-32 rounded-xl border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text tabular-nums disabled:opacity-50 ${
                thresholdError ? 'border-ui-error' : 'border-ui-border'
              }`}
            />
            {thresholdError ? (
              <p
                id={thresholdErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-ui-error"
              >
                {thresholdError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            className="mt-5 rounded-xl bg-ui-accent px-3.5 py-2 text-xs font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
          >
            Save Threshold
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2 border-b border-ui-border pb-3">
            <h3 className="text-sm font-bold text-ui-text">
              {editingZoneId ? 'Edit delivery zone' : 'Add delivery zone'}
            </h3>
            {editingZoneId ? (
              <button
                type="button"
                onClick={cancelEditingZone}
                className="text-xs font-medium text-ui-text-muted underline hover:text-ui-text"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <form noValidate onSubmit={handleZoneSubmit} className="mt-4 space-y-3">
            <div>
              <label htmlFor="admin-zone-name" className="block text-xs font-semibold text-ui-text">
                Zone Name
              </label>
              <input
                ref={zoneNameInputRef}
                id="admin-zone-name"
                type="text"
                value={zoneForm.name}
                aria-invalid={Boolean(zoneErrors.name)}
                aria-describedby={zoneErrors.name ? zoneNameErrorId : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setZoneForm((prev) => ({ ...prev, name: value }));
                  if (zoneErrors.name && value.trim()) {
                    setZoneErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                placeholder="e.g. BGC, Pasay & Mandaluyong"
                className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                  zoneErrors.name ? 'border-ui-error' : 'border-ui-border'
                }`}
              />
              {zoneErrors.name ? (
                <p
                  id={zoneNameErrorId}
                  role="alert"
                  className="mt-1 text-xs font-semibold text-ui-error"
                >
                  {zoneErrors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="admin-zone-areas"
                className="block text-xs font-semibold text-ui-text"
              >
                Covered Areas / Landmarks
              </label>
              <input
                id="admin-zone-areas"
                type="text"
                value={zoneForm.areas}
                onChange={(event) =>
                  setZoneForm((prev) => ({ ...prev, areas: event.target.value }))
                }
                placeholder="e.g. Bonifacio High Street, MOA, Greenfield"
                className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="admin-zone-radius"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Max Distance (km)
                </label>
                <input
                  ref={zoneRadiusInputRef}
                  id="admin-zone-radius"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={zoneForm.maxDistanceKm}
                  aria-invalid={Boolean(zoneErrors.maxDistanceKm)}
                  aria-describedby={zoneErrors.maxDistanceKm ? zoneRadiusErrorId : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setZoneForm((prev) => ({ ...prev, maxDistanceKm: value }));
                    const numeric = Number(value);
                    if (
                      zoneErrors.maxDistanceKm &&
                      value.trim() !== '' &&
                      Number.isFinite(numeric) &&
                      numeric > 0
                    ) {
                      setZoneErrors((prev) => ({ ...prev, maxDistanceKm: undefined }));
                    }
                  }}
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                    zoneErrors.maxDistanceKm ? 'border-ui-error' : 'border-ui-border'
                  }`}
                />
                {zoneErrors.maxDistanceKm ? (
                  <p
                    id={zoneRadiusErrorId}
                    role="alert"
                    className="mt-1 text-xs font-semibold text-ui-error"
                  >
                    {zoneErrors.maxDistanceKm}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="admin-zone-fee"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Delivery Fee (₱)
                </label>
                <input
                  ref={zoneFeeInputRef}
                  id="admin-zone-fee"
                  type="number"
                  min={0}
                  step={1}
                  value={zoneForm.feePhp}
                  aria-invalid={Boolean(zoneErrors.feePhp)}
                  aria-describedby={zoneErrors.feePhp ? zoneFeeErrorId : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setZoneForm((prev) => ({ ...prev, feePhp: value }));
                    const numeric = Number(value);
                    if (
                      zoneErrors.feePhp &&
                      value.trim() !== '' &&
                      Number.isFinite(numeric) &&
                      numeric >= 0
                    ) {
                      setZoneErrors((prev) => ({ ...prev, feePhp: undefined }));
                    }
                  }}
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text tabular-nums ${
                    zoneErrors.feePhp ? 'border-ui-error' : 'border-ui-border'
                  }`}
                />
                {zoneErrors.feePhp ? (
                  <p
                    id={zoneFeeErrorId}
                    role="alert"
                    className="mt-1 text-xs font-semibold text-ui-error"
                  >
                    {zoneErrors.feePhp}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="admin-zone-eta"
                  className="block text-xs font-semibold text-ui-text"
                >
                  Estimated ETA
                </label>
                <input
                  ref={zoneEtaInputRef}
                  id="admin-zone-eta"
                  type="text"
                  value={zoneForm.etaMinutes}
                  aria-invalid={Boolean(zoneErrors.etaMinutes)}
                  aria-describedby={zoneErrors.etaMinutes ? zoneEtaErrorId : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setZoneForm((prev) => ({ ...prev, etaMinutes: value }));
                    if (zoneErrors.etaMinutes && value.trim()) {
                      setZoneErrors((prev) => ({ ...prev, etaMinutes: undefined }));
                    }
                  }}
                  placeholder="20–35 min"
                  className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                    zoneErrors.etaMinutes ? 'border-ui-error' : 'border-ui-border'
                  }`}
                />
                {zoneErrors.etaMinutes ? (
                  <p
                    id={zoneEtaErrorId}
                    role="alert"
                    className="mt-1 text-xs font-semibold text-ui-error"
                  >
                    {zoneErrors.etaMinutes}
                  </p>
                ) : null}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs text-ui-text">
              <input
                type="checkbox"
                checked={zoneForm.enabled}
                onChange={(event) =>
                  setZoneForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
                className="accent-ui-accent h-4 w-4 rounded"
              />
              <span>Accepting delivery orders for this zone</span>
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover"
            >
              {editingZoneId ? 'Save Zone Changes' : 'Add Delivery Zone'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7">
          {deliveryPricing.zones.length === 0 ? (
            <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-center text-sm text-ui-text-muted">
              No delivery zones configured. Customers can only place Kiosk Pickup orders until a
              zone is added or defaults are restored.
            </div>
          ) : (
            <ul className="space-y-3">
              {sortedZones.map((zone) => {
                const isEditing = editingZoneId === zone.id;
                const isConfirmingDelete = confirmDeleteZoneId === zone.id;
                return (
                  <li
                    key={zone.id}
                    className={`flex flex-col gap-3 rounded-2xl border bg-ui-surface p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                      isEditing ? 'border-ui-accent' : 'border-ui-border'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-ui-text">{zone.name}</h3>
                        <span className="rounded-md bg-ui-surface-muted px-2 py-0.5 text-xs font-bold text-ui-accent tabular-nums">
                          {zone.feePhp === 0 ? 'Free' : formatPhp(zone.feePhp)}
                        </span>
                        <span className="text-xs text-ui-text-muted tabular-nums">
                          Up to {zone.maxDistanceKm} km · {zone.etaMinutes}
                        </span>
                        {isEditing ? (
                          <span className="rounded-md bg-ui-accent px-2 py-0.5 text-xs font-semibold text-ui-on-accent">
                            Editing zone
                          </span>
                        ) : null}
                      </div>
                      {zone.areas ? (
                        <p className="mt-0.5 text-xs text-ui-text-muted">{zone.areas}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                      <button
                        type="button"
                        aria-pressed={zone.enabled}
                        aria-label={`${zone.enabled ? 'Active' : 'Paused'} — ${zone.enabled ? 'pause' : 'activate'} ${zone.name}`}
                        onClick={() => {
                          toggleDeliveryZone(zone.id);
                          onStatusMessage(
                            `${zone.enabled ? 'Paused' : 'Activated'} delivery zone "${zone.name}".`,
                          );
                        }}
                        className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                          zone.enabled
                            ? 'border-ui-border bg-ui-surface-muted text-ui-text hover:bg-ui-canvas'
                            : 'border-ui-error/40 bg-ui-error/10 text-ui-error'
                        }`}
                      >
                        {zone.enabled ? 'Active' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit zone ${zone.name}`}
                        onClick={() => startEditingZone(zone)}
                        className="whitespace-nowrap rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
                      >
                        Edit
                      </button>
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            aria-label={`Confirm delete zone ${zone.name}`}
                            onClick={() => {
                              deleteDeliveryZone(zone.id);
                              if (editingZoneId === zone.id) cancelEditingZone();
                              setConfirmDeleteZoneId(null);
                              onStatusMessage(`Removed delivery zone "${zone.name}".`);
                            }}
                            className="whitespace-nowrap rounded-lg bg-ui-error px-3 py-1.5 text-xs font-semibold text-ui-on-error hover:opacity-90"
                          >
                            Confirm delete
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancel delete zone ${zone.name}`}
                            onClick={() => setConfirmDeleteZoneId(null)}
                            className="whitespace-nowrap rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-xs font-medium text-ui-text hover:bg-ui-surface-muted"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete zone ${zone.name}`}
                          onClick={() => setConfirmDeleteZoneId(zone.id)}
                          className="whitespace-nowrap rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-error hover:bg-ui-surface-muted"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

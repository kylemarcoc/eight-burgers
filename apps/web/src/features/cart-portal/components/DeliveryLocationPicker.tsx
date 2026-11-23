import { useEffect, useId, useRef, useState } from 'react';
import { formatPhp, isValidCoordinates } from '@/shared/shop/shop-storage';
import type { DeliveryZone, GeoCoordinates } from '@/shared/shop/types';

export type DeliveryLocationPickerProps = {
  zones: readonly DeliveryZone[];
  selectedZoneId: string | null;
  pin: GeoCoordinates | null;
  outOfRange: boolean;
  distanceKm: number | null;
  onZoneChange: (zoneId: string) => void;
  onPinChange: (nextPin: GeoCoordinates, resolvedAddress?: string) => void;
  onClearPin: () => void;
};

type NominatimAddressFields = {
  house_number?: unknown;
  road?: unknown;
  neighbourhood?: unknown;
  suburb?: unknown;
  quarter?: unknown;
  village?: unknown;
  city?: unknown;
  town?: unknown;
  municipality?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstString(values: readonly unknown[]): string | null {
  for (const value of values) {
    const parsed = readString(value);
    if (parsed) return parsed;
  }
  return null;
}

function parseNominatimReverseLabel(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const candidate = raw as {
    address?: unknown;
    display_name?: unknown;
  };

  const parts: string[] = [];
  if (
    typeof candidate.address === 'object' &&
    candidate.address !== null &&
    !Array.isArray(candidate.address)
  ) {
    const addr = candidate.address as NominatimAddressFields;
    const road = readString(addr.road);
    const houseNumber = readString(addr.house_number);
    const street = road ? (houseNumber ? `${houseNumber} ${road}` : road) : null;
    const area = firstString([addr.neighbourhood, addr.suburb, addr.quarter, addr.village]);
    const locality = firstString([addr.city, addr.town, addr.municipality]);

    for (const part of [street, area, locality]) {
      if (part && !parts.some((existing) => existing.toLowerCase() === part.toLowerCase())) {
        parts.push(part);
      }
    }
  }

  let resolved = parts.join(', ').trim();
  if (!resolved) {
    const displayName = readString(candidate.display_name);
    if (displayName) {
      resolved = displayName
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
    }
  }

  if (!resolved) return null;
  return resolved.slice(0, 250).trim() || null;
}

export function DeliveryLocationPicker({
  zones,
  selectedZoneId,
  pin,
  outOfRange,
  distanceKm,
  onZoneChange,
  onPinChange,
  onClearPin,
}: DeliveryLocationPickerProps) {
  const isMountedRef = useRef(true);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const locationSeqRef = useRef(0);

  const [locating, setLocating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const zoneSelectId = useId();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      reverseAbortRef.current?.abort();
    };
  }, []);

  const activeZone = zones.find((zone) => zone.id === selectedZoneId) ?? zones[0] ?? null;

  async function resolveReverseAddress(nextPin: GeoCoordinates, reqSeq: number) {
    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;

    try {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
        `&lat=${encodeURIComponent(String(nextPin.lat))}` +
        `&lon=${encodeURIComponent(String(nextPin.lng))}` +
        `&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;

      const rawPayload = (await response.json()) as unknown;
      const label = parseNominatimReverseLabel(rawPayload);
      if (label && isMountedRef.current && locationSeqRef.current === reqSeq) {
        onPinChange(nextPin, label);
        setStatusMessage(
          'Using your device location. Add unit, floor, or gate notes below if needed.',
        );
      }
    } catch {
      // Silently preserve the GPS coordinates so the customer can still edit/type manually.
    } finally {
      if (reverseAbortRef.current === controller) {
        reverseAbortRef.current = null;
      }
    }
  }

  function handleZoneSelectChange(nextZoneId: string) {
    locationSeqRef.current += 1;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;
    setLocating(false);
    setErrorMessage(null);
    setStatusMessage(null);
    onZoneChange(nextZoneId);
  }

  function handleClearPinClick() {
    locationSeqRef.current += 1;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;
    setLocating(false);
    setErrorMessage(null);
    setStatusMessage(null);
    onClearPin();
  }

  function handleUseMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMessage(
        'Location services are unavailable in this browser. Choose your delivery area and enter your address below.',
      );
      setStatusMessage(null);
      return;
    }

    locationSeqRef.current += 1;
    const reqSeq = locationSeqRef.current;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;

    setLocating(true);
    setErrorMessage(null);
    setStatusMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isMountedRef.current || locationSeqRef.current !== reqSeq) return;
        setLocating(false);
        const nextPin: GeoCoordinates = {
          lat: Number(position.coords.latitude.toFixed(5)),
          lng: Number(position.coords.longitude.toFixed(5)),
        };
        if (!isValidCoordinates(nextPin)) {
          setErrorMessage('Could not read a valid GPS location. Choose your delivery area below.');
          return;
        }
        onPinChange(nextPin);
        setStatusMessage(
          'Using your device location. Review or complete your delivery address below.',
        );
        void resolveReverseAddress(nextPin, reqSeq);
      },
      () => {
        if (!isMountedRef.current || locationSeqRef.current !== reqSeq) return;
        setLocating(false);
        setErrorMessage(
          'Could not access your device location. Choose your delivery area and enter your address below.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={zoneSelectId} className="text-xs font-semibold text-ui-text">
          Delivery Area
        </label>
        <button
          type="button"
          disabled={locating}
          aria-label="Use my location"
          aria-busy={locating}
          onClick={handleUseMyLocation}
          className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
        >
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      <select
        id={zoneSelectId}
        name="deliveryZoneId"
        value={activeZone?.id ?? ''}
        onChange={(event) => handleZoneSelectChange(event.target.value)}
        className="w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-xs font-medium text-ui-text"
      >
        {zones.map((zone) => (
          <option key={zone.id} value={zone.id}>
            {zone.name} — {zone.feePhp > 0 ? formatPhp(zone.feePhp) : 'Free'} ({zone.etaMinutes})
          </option>
        ))}
      </select>

      {activeZone && !outOfRange ? (
        <p className="text-[11px] text-ui-text-muted">Covers: {activeZone.areas}</p>
      ) : null}

      {pin && !outOfRange ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-[11px] text-ui-text-muted">
          <span className="tabular-nums">
            Using your device location
            {distanceKm !== null ? ` (~${distanceKm.toFixed(1)} km from Chino Roces)` : ''}
          </span>
          <button
            type="button"
            onClick={handleClearPinClick}
            className="font-semibold text-ui-accent underline hover:opacity-80"
          >
            Clear location
          </button>
        </div>
      ) : null}

      <div role="alert" aria-atomic="true">
        {errorMessage ? (
          <p className="text-xs font-semibold text-ui-error">{errorMessage}</p>
        ) : null}
      </div>

      <div role="status" aria-live="polite" aria-atomic="true">
        {statusMessage ? <p className="text-xs text-ui-text-muted">{statusMessage}</p> : null}
      </div>
    </div>
  );
}

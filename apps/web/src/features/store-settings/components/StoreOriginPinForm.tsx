import {
  buildGoogleMapsPinUrl,
  isValidCoordinates,
  type GeoCoordinates,
  type LocationSuggestion,
} from '@menu-kiosk/contracts';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { ApiError, getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import { reverseGeocodeStoreOrigin, searchStoreOriginAddresses } from '../api/store-settings-api';
import { useStoreProfile, useUpdateStoreProfileMutation } from '../hooks/useStoreSettings';

const SEARCH_DEBOUNCE_MS = 250;

export type StoreOriginPinFormProps = {
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function StoreOriginPinForm({ onStatusMessage }: StoreOriginPinFormProps) {
  const { store, deliveryPricing, catalogQuery } = useStoreProfile();
  const updateProfileMutation = useUpdateStoreProfileMutation();

  const [draftPin, setDraftPin] = useState<GeoCoordinates | null>(store.originCoords);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>(store.version);
  const [isDirty, setIsDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [lastSyncedKey, setLastSyncedKey] = useState(
    JSON.stringify([store.originCoords, store.version ?? null]),
  );

  const [query, setQuery] = useState('');
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const reqSeqRef = useRef(0);

  const headingId = useId();
  const searchInputId = useId();
  const listboxId = useId();
  const optionIdPrefix = useId();

  const currentKey = JSON.stringify([store.originCoords, store.version ?? null]);
  if (currentKey !== lastSyncedKey) {
    setLastSyncedKey(currentKey);
    if (!isDirty) {
      setDraftPin(store.originCoords);
      setLoadedVersion(store.version);
      setConflict(false);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      searchAbortRef.current?.abort();
      reverseAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!pendingQuery) return;
    const seq = reqSeqRef.current + 1;
    reqSeqRef.current = seq;

    const timer = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSearching(true);
      setIsOpen(true);
      setLookupError(null);

      void searchStoreOriginAddresses(pendingQuery, controller.signal)
        .then((results) => {
          if (!isMountedRef.current || reqSeqRef.current !== seq) return;
          setSuggestions(results);
          setHasSearched(true);
          setActiveIndex(results.length > 0 ? 0 : -1);
          setIsOpen(true);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.kind === 'cancelled') return;
          if (!isMountedRef.current || reqSeqRef.current !== seq) return;
          setSuggestions([]);
          setHasSearched(false);
          setIsOpen(false);
          setLookupError(
            getApiErrorMessage(
              error,
              'Address search is temporarily unavailable. Try again or use current GPS.',
            ),
          );
        })
        .finally(() => {
          if (searchAbortRef.current === controller) {
            searchAbortRef.current = null;
          }
          if (isMountedRef.current && reqSeqRef.current === seq) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [pendingQuery]);

  async function reloadLatestPin() {
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.store ?? store;
    setDraftPin(latest.originCoords);
    setLoadedVersion(latest.version);
    setLastSyncedKey(JSON.stringify([latest.originCoords, latest.version ?? null]));
    setIsDirty(false);
    setConflict(false);
    onStatusMessage('Reloaded latest shop location pin.');
  }

  function handleSelectSuggestion(suggestion: LocationSuggestion) {
    reqSeqRef.current += 1;
    searchAbortRef.current?.abort();
    reverseAbortRef.current?.abort();

    const label = suggestion.secondaryLabel
      ? `${suggestion.label}, ${suggestion.secondaryLabel}`
      : suggestion.label;
    setPendingQuery(null);
    setSearching(false);
    setIsOpen(false);
    setHasSearched(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setLookupError(null);
    setQuery(label);
    setResolvedLabel(label);
    setDraftPin(suggestion.coordinates);
    setIsDirty(true);
  }

  function handleInputChange(nextValue: string) {
    setQuery(nextValue);
    setLookupError(null);
    setActiveIndex(-1);

    const trimmed = nextValue.trim();
    if (trimmed.length < 2) {
      reqSeqRef.current += 1;
      searchAbortRef.current?.abort();
      setPendingQuery(null);
      setSearching(false);
      setSuggestions([]);
      setHasSearched(false);
      setIsOpen(false);
      return;
    }
    setPendingQuery(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (event.key === 'Enter' && isOpen && activeIndex >= 0) {
      const selected = suggestions[activeIndex];
      if (selected) {
        event.preventDefault();
        handleSelectSuggestion(selected);
      }
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleUseCurrentGps() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLookupError('Location services are unavailable in this browser. Search your address.');
      return;
    }

    reqSeqRef.current += 1;
    const seq = reqSeqRef.current;
    searchAbortRef.current?.abort();
    reverseAbortRef.current?.abort();

    setPendingQuery(null);
    setSearching(false);
    setIsOpen(false);
    setLocating(true);
    setLookupError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isMountedRef.current || reqSeqRef.current !== seq) return;
        setLocating(false);
        const nextCoords: GeoCoordinates = {
          lat: Number(position.coords.latitude.toFixed(5)),
          lng: Number(position.coords.longitude.toFixed(5)),
        };
        if (!isValidCoordinates(nextCoords)) {
          setLookupError('Could not read valid GPS coordinates. Search your shop address instead.');
          return;
        }
        setDraftPin(nextCoords);
        setResolvedLabel(null);
        setIsDirty(true);

        const controller = new AbortController();
        reverseAbortRef.current = controller;
        void reverseGeocodeStoreOrigin(nextCoords, controller.signal)
          .then((label) => {
            if (!isMountedRef.current || reqSeqRef.current !== seq) return;
            if (label) {
              setQuery(label);
              setResolvedLabel(label);
            }
          })
          .catch(() => {
            // Keep coordinates cleanly even if reverse lookup fails.
          });
      },
      () => {
        if (!isMountedRef.current || reqSeqRef.current !== seq) return;
        setLocating(false);
        setLookupError('Could not access device GPS. Search your shop address instead.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function handleSavePin(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draftPin && deliveryPricing?.deliveryEnabled) {
      setLookupError('Pause delivery in Menu & Delivery before clearing the shop location pin.');
      return;
    }

    setLookupError(null);
    try {
      const updated = await updateProfileMutation.mutateAsync({
        originCoords: draftPin,
        expectedVersion: loadedVersion ?? store.version,
      });
      setDraftPin(updated.originCoords);
      setLoadedVersion(updated.version);
      setLastSyncedKey(JSON.stringify([updated.originCoords, updated.version ?? null]));
      setIsDirty(false);
      setConflict(false);
      onStatusMessage(
        updated.originCoords
          ? `Saved shop location pin (${updated.originCoords.lat.toFixed(5)}, ${updated.originCoords.lng.toFixed(5)}).`
          : 'Cleared shop location pin.',
      );
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setConflict(true);
      }
      onStatusMessage(getApiErrorMessage(error, 'Failed to save shop location pin.'), 'error');
    }
  }

  const activeOptionId =
    isOpen && activeIndex >= 0 && suggestions[activeIndex]
      ? `${optionIdPrefix}-${activeIndex}`
      : undefined;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ui-border pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="text-lg font-bold text-ui-text">
              Shop location pin
            </h2>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                store.originCoords
                  ? 'bg-ui-surface-muted text-ui-accent'
                  : 'border border-ui-error/40 bg-ui-error/10 text-ui-error'
              }`}
            >
              {store.originCoords ? 'Pin set' : 'Not configured'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ui-text-muted">
            Used to calculate delivery distances and bias Philippine address suggestions near your
            shop. Required before enabling delivery.
          </p>
        </div>
      </div>

      {conflict ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
        >
          <span>Shop pin changed on another device. Reload latest values before saving.</span>
          <button
            type="button"
            onClick={() => void reloadLatestPin()}
            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Reload latest pin
          </button>
        </div>
      ) : null}

      <form noValidate onSubmit={(event) => void handleSavePin(event)} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={searchInputId} className="text-xs font-semibold text-ui-text">
            Search Philippine shop address
          </label>
          <button
            type="button"
            disabled={locating}
            aria-busy={locating}
            onClick={handleUseCurrentGps}
            className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
          >
            {locating ? 'Locating…' : 'Use current GPS'}
          </button>
        </div>

        <div className="relative">
          <input
            id={searchInputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            maxLength={250}
            value={query}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (searching || hasSearched || suggestions.length > 0) setIsOpen(true);
            }}
            onBlur={() => {
              setIsOpen(false);
              setActiveIndex(-1);
            }}
            placeholder="Search street, building, barangay, or city in the Philippines"
            className="w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
          />

          {isOpen ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Shop address suggestions"
              className="absolute right-0 left-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-ui-border bg-ui-surface p-1 shadow-lg"
            >
              {searching ? (
                <p className="px-3 py-2 text-xs text-ui-text-muted">Searching addresses…</p>
              ) : suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={suggestion.id}
                      id={`${optionIdPrefix}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-ui-surface-muted text-ui-text'
                          : 'text-ui-text hover:bg-ui-surface-muted'
                      }`}
                    >
                      <span className="font-semibold">{suggestion.label}</span>
                      {suggestion.secondaryLabel ? (
                        <span className="text-[11px] text-ui-text-muted">
                          {suggestion.secondaryLabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : hasSearched ? (
                <p className="px-3 py-2 text-xs text-ui-text-muted">
                  No matching addresses found. Try a nearby landmark or use current GPS.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {draftPin ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-border bg-ui-canvas px-3 py-2.5 text-xs">
            <div className="space-y-0.5">
              <p className="font-semibold text-ui-text">
                {resolvedLabel ?? 'Selected shop coordinates'}
              </p>
              <p className="text-ui-text-muted tabular-nums">
                {draftPin.lat.toFixed(5)}, {draftPin.lng.toFixed(5)} ·{' '}
                <a
                  href={buildGoogleMapsPinUrl(draftPin)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ui-accent underline underline-offset-2"
                >
                  Verify on Google Maps
                </a>
              </p>
            </div>

            {!deliveryPricing?.deliveryEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setDraftPin(null);
                  setResolvedLabel(null);
                  setQuery('');
                  setIsDirty(true);
                }}
                className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-medium text-ui-error hover:bg-ui-surface-muted"
              >
                Clear pin
              </button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs text-ui-text-muted">
            No shop pin set yet. Search your address above or use current GPS to enable distance
            delivery pricing.
          </p>
        )}

        {lookupError ? (
          <p role="alert" className="text-xs font-semibold text-ui-error">
            {lookupError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={updateProfileMutation.isPending || !isDirty}
          className="rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
        >
          {updateProfileMutation.isPending ? 'Saving pin…' : 'Save shop location pin'}
        </button>
      </form>
    </section>
  );
}

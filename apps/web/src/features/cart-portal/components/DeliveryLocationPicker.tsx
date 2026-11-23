import type { LocationSuggestion } from '@eight-burgers/contracts';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ApiError, getApiErrorMessage } from '@/shared/lib/api-error';
import { isValidCoordinates } from '@/shared/shop/shop-storage';
import type { GeoCoordinates } from '@/shared/shop/types';
import { reverseGeocodeDeliveryPin, searchDeliveryAddresses } from '../api/location-api';

export type DeliveryLocationPickerProps = {
  inputRef?: RefObject<HTMLInputElement | null>;
  selectedAddress: string | null;
  pin: GeoCoordinates | null;
  outOfRange: boolean;
  distanceKm: number | null;
  errorText?: string;
  errorId?: string;
  onSelectLocation: (nextPin: GeoCoordinates, resolvedAddress?: string | null) => void;
  onClearLocation: () => void;
};

const SEARCH_DEBOUNCE_MS = 250;

export function DeliveryLocationPicker({
  inputRef,
  selectedAddress,
  pin,
  outOfRange,
  distanceKm,
  errorText,
  errorId,
  onSelectLocation,
  onClearLocation,
}: DeliveryLocationPickerProps) {
  const isMountedRef = useRef(true);
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedInputRef = inputRef ?? internalInputRef;
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const locationSeqRef = useRef(0);
  const prevSelectedAddressRef = useRef<string | null>(selectedAddress);

  const [query, setQuery] = useState(selectedAddress ?? '');
  const [pendingSearchQuery, setPendingSearchQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const searchInputId = useId();
  const hintId = useId();
  const listboxId = useId();
  const optionIdPrefix = useId();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      searchAbortRef.current?.abort();
      reverseAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const prev = prevSelectedAddressRef.current;
    prevSelectedAddressRef.current = selectedAddress;
    if (selectedAddress && selectedAddress !== prev) {
      setQuery(selectedAddress);
    } else if (!selectedAddress && prev && query === prev) {
      setQuery('');
    }
  }, [selectedAddress, query]);

  useEffect(() => {
    if (!pendingSearchQuery) return;

    const reqSeq = locationSeqRef.current + 1;
    locationSeqRef.current = reqSeq;

    const timer = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSearching(true);
      setIsOpen(true);
      setLookupError(null);

      void searchDeliveryAddresses(pendingSearchQuery, controller.signal)
        .then((results) => {
          if (!isMountedRef.current || locationSeqRef.current !== reqSeq) return;
          setSuggestions(results);
          setHasSearched(true);
          setActiveIndex(results.length > 0 ? 0 : -1);
          setIsOpen(true);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.kind === 'cancelled') return;
          if (!isMountedRef.current || locationSeqRef.current !== reqSeq) return;
          setSuggestions([]);
          setHasSearched(false);
          setIsOpen(false);
          setActiveIndex(-1);
          setLookupError(
            getApiErrorMessage(
              error,
              'Address search is temporarily unavailable. Try again or use your device location.',
            ),
          );
        })
        .finally(() => {
          if (searchAbortRef.current === controller) {
            searchAbortRef.current = null;
          }
          if (isMountedRef.current && locationSeqRef.current === reqSeq) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [pendingSearchQuery]);

  async function resolveReverseAddress(nextPin: GeoCoordinates, reqSeq: number) {
    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;

    try {
      const label = await reverseGeocodeDeliveryPin(nextPin, controller.signal);
      if (!isMountedRef.current || locationSeqRef.current !== reqSeq) return;
      if (label) {
        setQuery(label);
        onSelectLocation(nextPin, label);
        setStatusMessage(
          'Using your device location. Add unit, floor, or gate notes below if needed.',
        );
      } else {
        setStatusMessage(
          'Using your device location. Enter your street, building, and rider notes below.',
        );
      }
    } catch {
      if (!isMountedRef.current || locationSeqRef.current !== reqSeq) return;
      setStatusMessage(
        'Using your device location. Enter your street, building, and rider notes below.',
      );
    } finally {
      if (reverseAbortRef.current === controller) {
        reverseAbortRef.current = null;
      }
    }
  }

  function handleSelectSuggestion(suggestion: LocationSuggestion) {
    locationSeqRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;

    const fullLabel = suggestion.secondaryLabel
      ? `${suggestion.label}, ${suggestion.secondaryLabel}`
      : suggestion.label;

    setPendingSearchQuery(null);
    setSearching(false);
    setLocating(false);
    setIsOpen(false);
    setHasSearched(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setLookupError(null);
    setQuery(fullLabel);
    setStatusMessage('Address selected. Add your building, unit, or rider notes below if needed.');
    onSelectLocation(suggestion.coordinates, fullLabel);
  }

  function handleInputChange(nextValue: string) {
    setQuery(nextValue);
    setLookupError(null);
    setStatusMessage(null);
    setActiveIndex(-1);

    if (pin) {
      onClearLocation();
    }

    const trimmed = nextValue.trim();
    if (trimmed.length < 2) {
      locationSeqRef.current += 1;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      setPendingSearchQuery(null);
      setSearching(false);
      setSuggestions([]);
      setHasSearched(false);
      setIsOpen(false);
      return;
    }

    setPendingSearchQuery(trimmed);
  }

  function handleChangeLocationClick() {
    locationSeqRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;

    setPendingSearchQuery(null);
    setSearching(false);
    setLocating(false);
    setSuggestions([]);
    setIsOpen(false);
    setHasSearched(false);
    setActiveIndex(-1);
    setLookupError(null);
    setStatusMessage(null);
    setQuery('');
    onClearLocation();
    resolvedInputRef.current?.focus();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (suggestions.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      if (suggestions.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
      return;
    }

    if (event.key === 'Enter' && isOpen && activeIndex >= 0) {
      const activeSuggestion = suggestions[activeIndex];
      if (activeSuggestion) {
        event.preventDefault();
        handleSelectSuggestion(activeSuggestion);
      }
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleUseMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLookupError(
        'Location services are unavailable in this browser. Search your street or landmark above.',
      );
      setStatusMessage(null);
      return;
    }

    locationSeqRef.current += 1;
    const reqSeq = locationSeqRef.current;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;

    setPendingSearchQuery(null);
    setSearching(false);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setLocating(true);
    setLookupError(null);
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
          setLookupError(
            'Could not read a valid GPS location. Search your street or landmark instead.',
          );
          return;
        }
        onSelectLocation(nextPin, null);
        setStatusMessage('Using your device location. Looking up street address…');
        void resolveReverseAddress(nextPin, reqSeq);
      },
      () => {
        if (!isMountedRef.current || locationSeqRef.current !== reqSeq) return;
        setLocating(false);
        setLookupError(
          'Could not access your device location. Search your street or landmark above.',
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const activeOptionId =
    isOpen && activeIndex >= 0 && suggestions[activeIndex]
      ? `${optionIdPrefix}-${activeIndex}`
      : undefined;

  const describedByIds = [!pin ? hintId : null, errorText && errorId ? errorId : null].filter(
    Boolean,
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={searchInputId} className="text-xs font-semibold text-ui-text">
          Delivery Address
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

      <div className="relative">
        <input
          ref={resolvedInputRef}
          id={searchInputId}
          name="deliveryAddressSearch"
          type="text"
          role="combobox"
          autoComplete="street-address"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-invalid={Boolean(errorText)}
          aria-describedby={describedByIds.length > 0 ? describedByIds.join(' ') : undefined}
          maxLength={250}
          value={query}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => {
            if (!pin && (searching || hasSearched || suggestions.length > 0)) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            setIsOpen(false);
            setActiveIndex(-1);
          }}
          placeholder="Search street, building, or landmark in Metro Manila"
          className={`w-full rounded-xl border bg-ui-canvas px-3 py-2 text-xs font-medium text-ui-text ${
            errorText ? 'border-ui-error' : 'border-ui-border'
          }`}
        />

        {isOpen ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Address suggestions"
            className="absolute right-0 left-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-ui-border bg-ui-surface p-1 shadow-lg"
          >
            {searching ? (
              <p className="px-3 py-2 text-xs text-ui-text-muted">
                Searching Metro Manila addresses…
              </p>
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
                No matching addresses found. Try a nearby street or landmark, or use your device
                location.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {!pin ? (
        <p id={hintId} className="text-[11px] text-ui-text-muted">
          Search your street or nearest landmark, then add your building or unit below.
        </p>
      ) : !outOfRange ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ui-border bg-ui-surface px-3 py-1.5 text-[11px] text-ui-text-muted">
          <span className="min-w-0 truncate tabular-nums">
            <span className="font-semibold text-ui-text">
              {selectedAddress ?? 'Device location'}
            </span>
            {distanceKm !== null ? ` (~${distanceKm.toFixed(1)} km from Chino Roces)` : ''}
          </span>
          <button
            type="button"
            onClick={handleChangeLocationClick}
            className="shrink-0 font-semibold text-ui-accent underline hover:opacity-80"
          >
            Change
          </button>
        </div>
      ) : null}

      <div role="alert" aria-atomic="true" className="space-y-1">
        {errorText ? (
          <p id={errorId} className="text-xs font-semibold text-ui-error">
            {errorText}
          </p>
        ) : null}
        {lookupError ? <p className="text-xs font-semibold text-ui-error">{lookupError}</p> : null}
      </div>

      <div role="status" aria-live="polite" aria-atomic="true">
        {statusMessage ? <p className="text-xs text-ui-text-muted">{statusMessage}</p> : null}
      </div>
    </div>
  );
}

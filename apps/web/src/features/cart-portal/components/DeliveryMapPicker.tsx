import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { METRO_MANILA_LANDMARK_PINS, STORE_ORIGIN_COORDS } from '@/shared/shop/eight-burgers-seed';
import { ROAD_DISTANCE_FACTOR, isValidCoordinates } from '@/shared/shop/shop-storage';
import type { GeoCoordinates } from '@/shared/shop/types';

export type DeliveryMapPickerProps = {
  pin: GeoCoordinates | null;
  maxDeliveryDistanceKm: number | null;
  onPinChange: (nextPin: GeoCoordinates, label?: string) => void;
  searchInputRef?: Ref<HTMLInputElement>;
  pinErrorId?: string;
  hasPinError?: boolean;
};

function parseNominatimFirstHit(
  raw: unknown,
): { coords: GeoCoordinates; label: string | null } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first: unknown = raw[0];
  if (typeof first !== 'object' || first === null) return null;

  const candidate = first as { lat?: unknown; lon?: unknown; display_name?: unknown };
  const lat =
    typeof candidate.lat === 'string' || typeof candidate.lat === 'number'
      ? Number(candidate.lat)
      : Number.NaN;
  const lng =
    typeof candidate.lon === 'string' || typeof candidate.lon === 'number'
      ? Number(candidate.lon)
      : Number.NaN;

  const coords: GeoCoordinates = { lat, lng };
  if (!isValidCoordinates(coords)) return null;

  const label =
    typeof candidate.display_name === 'string' && candidate.display_name.trim()
      ? candidate.display_name.split(',').slice(0, 3).join(',').trim()
      : null;

  return {
    coords: {
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
    },
    label,
  };
}

function createStoreIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#1c1917;color:#faf6f0;font-size:11px;font-weight:700;border:2px solid #faf6f0;box-shadow:0 2px 6px rgba(0,0,0,0.35);">8B</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createDeliveryPinIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:#c2410c;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.35);"><span style="width:8px;height:8px;border-radius:9999px;background:#ffffff;"></span></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

export default function DeliveryMapPicker({
  pin,
  maxDeliveryDistanceKm,
  onPinChange,
  searchInputRef,
  pinErrorId,
  hasPinError = false,
}: DeliveryMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  const searchAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const skipNextFitBoundsRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const searchInputId = useId();

  useEffect(() => {
    onPinChangeRef.current = onPinChange;
  }, [onPinChange]);

  useEffect(() => {
    isMountedRef.current = true;
    const container = mapContainerRef.current;
    if (!container) {
      return () => {
        isMountedRef.current = false;
      };
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let map: L.Map;
    try {
      map = L.map(container, {
        center: [STORE_ORIGIN_COORDS.lat, STORE_ORIGIN_COORDS.lng],
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
        zoomAnimation: !prefersReducedMotion,
        fadeAnimation: !prefersReducedMotion,
        markerZoomAnimation: !prefersReducedMotion,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      L.marker([STORE_ORIGIN_COORDS.lat, STORE_ORIGIN_COORDS.lng], {
        icon: createStoreIcon(),
        title: '8Burgers Chino Roces Kiosk',
        keyboard: false,
      }).addTo(map);

      map.on('click', (event: L.LeafletMouseEvent) => {
        skipNextFitBoundsRef.current = true;
        onPinChangeRef.current({
          lat: Number(event.latlng.lat.toFixed(5)),
          lng: Number(event.latlng.lng.toFixed(5)),
        });
      });

      mapRef.current = map;
    } catch {
      return () => {
        isMountedRef.current = false;
        searchAbortRef.current?.abort();
      };
    }

    return () => {
      isMountedRef.current = false;
      searchAbortRef.current?.abort();
      pinMarkerRef.current = null;
      routeLineRef.current = null;
      radiusCircleRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (radiusCircleRef.current) {
      radiusCircleRef.current.remove();
      radiusCircleRef.current = null;
    }

    if (maxDeliveryDistanceKm !== null && maxDeliveryDistanceKm > 0) {
      const approxAirRadiusMeters = (maxDeliveryDistanceKm / ROAD_DISTANCE_FACTOR) * 1000;
      radiusCircleRef.current = L.circle([STORE_ORIGIN_COORDS.lat, STORE_ORIGIN_COORDS.lng], {
        radius: approxAirRadiusMeters,
        color: '#c2410c',
        weight: 1,
        dashArray: '4 4',
        fillColor: '#c2410c',
        fillOpacity: 0.04,
        interactive: false,
      }).addTo(map);
    }
  }, [maxDeliveryDistanceKm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!pin) {
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      routeLineRef.current?.remove();
      routeLineRef.current = null;
      return;
    }

    const latLng: L.LatLngExpression = [pin.lat, pin.lng];

    if (!pinMarkerRef.current) {
      const marker = L.marker(latLng, {
        draggable: true,
        icon: createDeliveryPinIcon(),
        title: 'Your delivery pin (drag to adjust)',
      }).addTo(map);

      marker.on('dragend', () => {
        const next = marker.getLatLng();
        skipNextFitBoundsRef.current = true;
        onPinChangeRef.current({
          lat: Number(next.lat.toFixed(5)),
          lng: Number(next.lng.toFixed(5)),
        });
      });

      pinMarkerRef.current = marker;
    } else {
      pinMarkerRef.current.setLatLng(latLng);
    }

    const linePoints: L.LatLngExpression[] = [
      [STORE_ORIGIN_COORDS.lat, STORE_ORIGIN_COORDS.lng],
      latLng,
    ];
    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(linePoints, {
        color: '#c2410c',
        weight: 2,
        dashArray: '5 5',
        opacity: 0.75,
        interactive: false,
      }).addTo(map);
    } else {
      routeLineRef.current.setLatLngs(linePoints);
    }

    if (skipNextFitBoundsRef.current) {
      skipNextFitBoundsRef.current = false;
      return;
    }

    try {
      const bounds = L.latLngBounds(linePoints);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15, animate: false });
    } catch {
      // Ignore layout fit errors in headless test environments.
    }
  }, [pin]);

  async function handleSearchLocation() {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchStatus('error');
      setSearchMessage('Enter a street, condo, mall, or barangay in Metro Manila to search.');
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchStatus('searching');
    setSearchMessage(null);

    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph` +
        `&viewbox=120.89,14.79,121.15,14.35&bounded=1&q=${encodeURIComponent(trimmed)}`;
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Location lookup failed');
      }
      const results = (await response.json()) as unknown;
      const hit = parseNominatimFirstHit(results);
      if (!hit) {
        setSearchStatus('error');
        setSearchMessage(
          'No matching Metro Manila location found. Try a nearby landmark or pick a quick pin.',
        );
        return;
      }

      const shortLabel = hit.label ?? trimmed;
      onPinChange(hit.coords, shortLabel);
      setSearchStatus('idle');
      setSearchMessage(`Pinned near ${shortLabel}. Search again or drag the pin to adjust.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSearchStatus('error');
      setSearchMessage('Map search is currently unavailable. Tap the map or pick a nearby area.');
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSearchLocation();
    }
  }

  function handleUseMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setSearchStatus('error');
      setSearchMessage(
        'Location services are unavailable in this browser. Search or pick a quick pin instead.',
      );
      return;
    }

    setLocating(true);
    setSearchMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isMountedRef.current) return;
        setLocating(false);
        const nextPin: GeoCoordinates = {
          lat: Number(position.coords.latitude.toFixed(5)),
          lng: Number(position.coords.longitude.toFixed(5)),
        };
        if (!isValidCoordinates(nextPin)) {
          setSearchStatus('error');
          setSearchMessage('Could not read a valid GPS location. Search or pick a nearby area.');
          return;
        }
        onPinChange(nextPin);
        setSearchStatus('idle');
        setSearchMessage('Pinned to your current location. Search or drag the pin if needed.');
      },
      () => {
        if (!isMountedRef.current) return;
        setLocating(false);
        setSearchStatus('error');
        setSearchMessage('Could not access GPS location. Tap the map or search a landmark.');
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={searchInputId} className="text-xs font-semibold text-ui-text">
          Pin Delivery Location
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

      <div className="flex gap-1.5">
        <input
          ref={searchInputRef}
          id={searchInputId}
          type="search"
          value={searchQuery}
          aria-invalid={Boolean(hasPinError)}
          aria-describedby={hasPinError && pinErrorId ? pinErrorId : undefined}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search landmark, condo, or city (e.g. Alabang)"
          className={`min-w-0 flex-1 rounded-xl border bg-ui-canvas px-3 py-1.5 text-xs text-ui-text ${
            hasPinError ? 'border-ui-error' : 'border-ui-border'
          }`}
        />
        <button
          type="button"
          disabled={searchStatus === 'searching'}
          aria-label="Find"
          aria-busy={searchStatus === 'searching'}
          onClick={() => void handleSearchLocation()}
          className="shrink-0 rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50"
        >
          {searchStatus === 'searching' ? 'Finding…' : 'Find'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ui-text-muted">Quick pin:</span>
        {METRO_MANILA_LANDMARK_PINS.map((landmark) => (
          <button
            key={landmark.label}
            type="button"
            onClick={() => {
              onPinChange(landmark.coords, landmark.label);
              setSearchStatus('idle');
              setSearchMessage(
                `Pinned near ${landmark.label}. Search again or drag the marker to adjust.`,
              );
            }}
            className="min-h-6 rounded-md border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-medium text-ui-text hover:bg-ui-canvas"
          >
            {landmark.label}
          </button>
        ))}
      </div>

      <div
        ref={mapContainerRef}
        role="region"
        aria-label="Interactive Metro Manila delivery map"
        className="relative z-0 h-44 w-full overflow-hidden rounded-xl border border-ui-border bg-ui-canvas"
      />

      <div role="alert" aria-atomic="true">
        {searchStatus === 'error' && searchMessage ? (
          <p className="text-xs font-semibold text-ui-error">{searchMessage}</p>
        ) : null}
      </div>

      <div role="status" aria-live="polite" aria-atomic="true">
        {searchStatus !== 'error' && searchMessage ? (
          <p className="text-xs text-ui-text-muted">{searchMessage}</p>
        ) : null}
      </div>

      {!searchMessage ? (
        <p className="text-[11px] text-ui-text-muted">
          Tap the map, search a landmark, or use a quick pin above. Delivery zone and fee lock
          automatically.
        </p>
      ) : null}
    </div>
  );
}

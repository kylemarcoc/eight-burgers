import { DEFAULT_DELIVERY_PRICING } from '@eight-burgers/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliveryLocationPicker } from './DeliveryLocationPicker';

const ORIGINAL_GEOLOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

function restoreGeolocation() {
  if (ORIGINAL_GEOLOCATION_DESCRIPTOR) {
    Object.defineProperty(navigator, 'geolocation', ORIGINAL_GEOLOCATION_DESCRIPTOR);
  } else {
    Reflect.deleteProperty(navigator, 'geolocation');
  }
}

function createGeolocationPosition(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

afterEach(() => {
  cleanup();
  restoreGeolocation();
  vi.restoreAllMocks();
});

describe('DeliveryLocationPicker', () => {
  it('renders enabled delivery areas and allows manual zone selection', () => {
    const onZoneChange = vi.fn();
    render(
      <DeliveryLocationPicker
        zones={DEFAULT_DELIVERY_PRICING.zones}
        selectedZoneId={DEFAULT_DELIVERY_PRICING.zones[0]?.id ?? null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onZoneChange={onZoneChange}
        onPinChange={vi.fn()}
        onClearPin={vi.fn()}
      />,
    );

    const select = screen.getByLabelText(/delivery area/i) as HTMLSelectElement;
    expect(select.options).toHaveLength(DEFAULT_DELIVERY_PRICING.zones.length);
    expect(screen.getByText(/covers:/i)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();

    fireEvent.change(select, { target: { value: 'bgc-pasay-mandaluyong' } });
    expect(onZoneChange).toHaveBeenCalledWith('bgc-pasay-mandaluyong');
  });

  it('uses device GPS and privacy-hardened Nominatim reverse geocoding to pass resolved address', async () => {
    const onPinChange = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(createGeolocationPosition(14.5608, 121.0124));
        }),
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          address: {
            house_number: '215',
            road: 'Chino Roces Avenue',
            neighbourhood: 'San Antonio',
            city: 'Makati',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(
      <DeliveryLocationPicker
        zones={DEFAULT_DELIVERY_PRICING.zones}
        selectedZoneId={DEFAULT_DELIVERY_PRICING.zones[0]?.id ?? null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onZoneChange={vi.fn()}
        onPinChange={onPinChange}
        onClearPin={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));

    expect(onPinChange).toHaveBeenCalledWith({ lat: 14.5608, lng: 121.0124 });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://nominatim.openstreetmap.org/reverse?'),
      expect.objectContaining({
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }),
    );

    await waitFor(() => {
      expect(onPinChange).toHaveBeenCalledWith(
        { lat: 14.5608, lng: 121.0124 },
        '215 Chino Roces Avenue, San Antonio, Makati',
      );
    });
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('keeps GPS coordinates cleanly without error alert when reverse geocoding fails or returns malformed data', async () => {
    const onPinChange = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(createGeolocationPosition(14.5547, 121.0244));
        }),
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([{ invalid: true }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <DeliveryLocationPicker
        zones={DEFAULT_DELIVERY_PRICING.zones}
        selectedZoneId={DEFAULT_DELIVERY_PRICING.zones[0]?.id ?? null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onZoneChange={vi.fn()}
        onPinChange={onPinChange}
        onClearPin={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Using your device location');
    });
    expect(onPinChange).toHaveBeenCalledTimes(1);
    expect(onPinChange).toHaveBeenCalledWith({ lat: 14.5547, lng: 121.0244 });
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('surfaces accessible error alerts when geolocation is unavailable or denied while keeping zone select usable', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });

    const onZoneChange = vi.fn();
    const { rerender } = render(
      <DeliveryLocationPicker
        zones={DEFAULT_DELIVERY_PRICING.zones}
        selectedZoneId={DEFAULT_DELIVERY_PRICING.zones[0]?.id ?? null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onZoneChange={onZoneChange}
        onPinChange={vi.fn()}
        onClearPin={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));
    expect(screen.getByRole('alert').textContent).toContain('Location services are unavailable');

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({
            code: 1,
            message: 'User denied Geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
        }),
      },
    });

    rerender(
      <DeliveryLocationPicker
        zones={DEFAULT_DELIVERY_PRICING.zones}
        selectedZoneId={DEFAULT_DELIVERY_PRICING.zones[0]?.id ?? null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onZoneChange={onZoneChange}
        onPinChange={vi.fn()}
        onClearPin={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not access your device location',
    );

    fireEvent.change(screen.getByLabelText(/delivery area/i), {
      target: { value: 'makati-cbd-poblacion' },
    });
    expect(onZoneChange).toHaveBeenCalledWith('makati-cbd-poblacion');
  });

  it('ignores late geolocation callbacks after unmount', () => {
    const onPinChange = vi.fn();
    let savedSuccess: PositionCallback | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          savedSuccess = success;
        }),
      },
    });

    const { unmount } = render(
      <DeliveryLocationPicker
        zones={DEFAULT_DELIVERY_PRICING.zones}
        selectedZoneId={DEFAULT_DELIVERY_PRICING.zones[0]?.id ?? null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onZoneChange={vi.fn()}
        onPinChange={onPinChange}
        onClearPin={vi.fn()}
      />,
    );

    const locateBtn = screen.getByRole('button', { name: /^use my location$/i });
    fireEvent.click(locateBtn);
    expect(locateBtn.getAttribute('aria-busy')).toBe('true');

    unmount();
    savedSuccess?.(createGeolocationPosition(14.5547, 121.0244));

    expect(onPinChange).not.toHaveBeenCalled();
  });

  it('shows active device location distance and invokes onClearPin from Clear location', () => {
    const onClearPin = vi.fn();
    render(
      <DeliveryLocationPicker
        zones={DEFAULT_DELIVERY_PRICING.zones}
        selectedZoneId={DEFAULT_DELIVERY_PRICING.zones[0]?.id ?? null}
        pin={{ lat: 14.5608, lng: 121.0124 }}
        outOfRange={false}
        distanceKm={1.2}
        onZoneChange={vi.fn()}
        onPinChange={vi.fn()}
        onClearPin={onClearPin}
      />,
    );

    expect(
      screen.getByText(/using your device location \(~1\.2 km from chino roces\)/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /clear location/i }));
    expect(onClearPin).toHaveBeenCalledOnce();
  });
});

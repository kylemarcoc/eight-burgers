import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  restoreGeolocation();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DeliveryLocationPicker', () => {
  it('renders an address search combobox without any delivery zone dropdown', () => {
    render(
      <DeliveryLocationPicker
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={vi.fn()}
        onClearLocation={vi.fn()}
      />,
    );

    expect(screen.queryByRole('combobox', { name: /delivery area/i })).toBeNull();
    expect(screen.getByRole('combobox', { name: /delivery address/i })).toBeTruthy();
    expect(screen.getByText(/search your street or nearest landmark/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^use my location$/i })).toBeTruthy();
  });

  it('debounces address search via /api/v1/location/search and supports keyboard selection and Escape', async () => {
    const onSelectLocation = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: 'osm-w-1',
            label: 'Ayala Triangle Gardens',
            secondaryLabel: 'Ayala Avenue, Bel-Air, Makati',
            coordinates: { lat: 14.5572, lng: 121.0236 },
          },
          {
            id: 'osm-w-2',
            label: 'Ayala Center',
            secondaryLabel: 'Makati, Metro Manila',
            coordinates: { lat: 14.5515, lng: 121.0243 },
          },
        ],
      }),
    );

    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <DeliveryLocationPicker
          selectedAddress={null}
          pin={null}
          outOfRange={false}
          distanceKm={null}
          onSelectLocation={onSelectLocation}
          onClearLocation={vi.fn()}
        />
      </div>,
    );

    const input = screen.getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(input, { target: { value: 'A' } });
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Ayala' } });

    const option2 = await screen.findByRole('option', { name: /ayala center/i });
    expect(option2).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/location/search?q=Ayala',
      expect.objectContaining({ method: 'GET' }),
    );

    // Escape closes the suggestion listbox without letting Escape close a parent dialog
    let escapeDefaultPrevented = false;
    parentKeyDown.mockImplementation((event: KeyboardEvent<HTMLDivElement>) => {
      escapeDefaultPrevented = event.defaultPrevented;
    });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(escapeDefaultPrevented).toBe(true);

    // Reopen on focus and navigate with ArrowDown to the second option, then press Enter
    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelectLocation).toHaveBeenCalledWith(
      { lat: 14.5515, lng: 121.0243 },
      'Ayala Center, Makati, Metro Manila',
    );
  });

  it('shows empty-state guidance and surfaces lookup errors gracefully', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            type: 'https://eight-burgers.local/problems/location_service_unavailable',
            title: 'Service Unavailable',
            status: 503,
            code: 'LOCATION_SERVICE_UNAVAILABLE',
            detail:
              'Address search is temporarily unavailable. Try again or use your device location.',
          },
          503,
        ),
      );

    render(
      <DeliveryLocationPicker
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={vi.fn()}
        onClearLocation={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(input, { target: { value: 'Nonexistent Place' } });

    expect(await screen.findByText(/no matching addresses found/i)).toBeTruthy();

    fireEvent.change(input, { target: { value: 'Makati Ave' } });
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'Address search is temporarily unavailable',
      );
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses device GPS and BFF /api/v1/location/reverse to populate the address', async () => {
    const onSelectLocation = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(createGeolocationPosition(14.5608, 121.0124));
        }),
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({
        data: {
          label: '215 Chino Roces Avenue, San Antonio, Makati',
          coordinates: { lat: 14.5608, lng: 121.0124 },
        },
      }),
    );

    render(
      <DeliveryLocationPicker
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={onSelectLocation}
        onClearLocation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));

    expect(onSelectLocation).toHaveBeenCalledWith({ lat: 14.5608, lng: 121.0124 }, null);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/location/reverse?lat=14.5608&lng=121.0124',
      expect.objectContaining({ method: 'GET' }),
    );

    await waitFor(() => {
      expect(onSelectLocation).toHaveBeenCalledWith(
        { lat: 14.5608, lng: 121.0124 },
        '215 Chino Roces Avenue, San Antonio, Makati',
      );
    });
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('keeps GPS coordinates cleanly without error alert when reverse geocoding returns null', async () => {
    const onSelectLocation = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(createGeolocationPosition(14.5547, 121.0244));
        }),
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ data: null }));

    render(
      <DeliveryLocationPicker
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={onSelectLocation}
        onClearLocation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Enter your street, building, and rider notes below',
      );
    });
    expect(onSelectLocation).toHaveBeenCalledTimes(1);
    expect(onSelectLocation).toHaveBeenCalledWith({ lat: 14.5547, lng: 121.0244 }, null);
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('surfaces accessible error alerts when geolocation is unavailable or denied', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });

    const { rerender } = render(
      <DeliveryLocationPicker
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={vi.fn()}
        onClearLocation={vi.fn()}
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
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={vi.fn()}
        onClearLocation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not access your device location',
    );
  });

  it('ignores late geolocation callbacks after unmount and clears locked location on Change or input edit', () => {
    const onSelectLocation = vi.fn();
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
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={onSelectLocation}
        onClearLocation={vi.fn()}
      />,
    );

    const locateBtn = screen.getByRole('button', { name: /^use my location$/i });
    fireEvent.click(locateBtn);
    expect(locateBtn.getAttribute('aria-busy')).toBe('true');

    unmount();
    savedSuccess?.(createGeolocationPosition(14.5547, 121.0244));
    expect(onSelectLocation).not.toHaveBeenCalled();

    const onClearLocation = vi.fn();
    render(
      <DeliveryLocationPicker
        selectedAddress="Chino Roces Avenue, San Antonio, Makati"
        pin={{ lat: 14.5608, lng: 121.0124 }}
        outOfRange={false}
        distanceKm={1.2}
        onSelectLocation={vi.fn()}
        onClearLocation={onClearLocation}
      />,
    );

    expect(screen.getByText(/chino roces avenue, san antonio, makati/i)).toBeTruthy();
    expect(screen.getByText(/~1\.2 km from chino roces/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^change$/i }));
    expect(onClearLocation).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      screen.getByRole('combobox', { name: /delivery address/i }),
    );

    fireEvent.change(screen.getByRole('combobox', { name: /delivery address/i }), {
      target: { value: 'Ayala' },
    });
    expect(onClearLocation).toHaveBeenCalledTimes(2);
  });

  it('ignores stale out-of-order search responses and wraps ArrowUp selection to the last option', async () => {
    const onSelectLocation = vi.fn();
    let resolveSlow!: (value: Response) => void;
    const slowPromise = new Promise<Response>((resolve) => {
      resolveSlow = resolve;
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('q=Ayala')) {
        return slowPromise;
      }
      return Promise.resolve(
        jsonResponse({
          data: [
            {
              id: 'bgc-1',
              label: 'Bonifacio High Street',
              secondaryLabel: 'BGC, Taguig',
              coordinates: { lat: 14.5508, lng: 121.0505 },
            },
            {
              id: 'bgc-2',
              label: 'Uptown Mall',
              secondaryLabel: 'BGC, Taguig',
              coordinates: { lat: 14.5566, lng: 121.0542 },
            },
          ],
        }),
      );
    });

    render(
      <DeliveryLocationPicker
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={onSelectLocation}
        onClearLocation={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: /delivery address/i });
    fireEvent.change(input, { target: { value: 'Ayala' } });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/location/search?q=Ayala',
        expect.any(Object),
      );
    });

    // Type a newer query while the first request is still pending
    fireEvent.change(input, { target: { value: 'Bonifacio' } });
    const uptownOption = await screen.findByRole('option', { name: /uptown mall/i });
    expect(screen.getByRole('option', { name: /bonifacio high street/i })).toBeTruthy();

    // Late resolution of first request must not overwrite current suggestions
    resolveSlow(
      jsonResponse({
        data: [
          {
            id: 'ayala-late',
            label: 'Ayala Triangle Gardens',
            coordinates: { lat: 14.5572, lng: 121.0236 },
          },
        ],
      }),
    );
    await Promise.resolve();
    expect(screen.queryByRole('option', { name: /ayala triangle gardens/i })).toBeNull();

    // ArrowUp from index 0 wraps to last option (Uptown Mall)
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(uptownOption.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(uptownOption.id);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectLocation).toHaveBeenCalledWith(
      { lat: 14.5566, lng: 121.0542 },
      'Uptown Mall, BGC, Taguig',
    );
  });

  it('cancels a pending debounced search when Use my location is clicked and aborts in-flight search on unmount', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success(createGeolocationPosition(14.5608, 121.0124));
        }),
      },
    });

    let capturedSearchSignal: AbortSignal | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/location/reverse')) {
        return Promise.resolve(
          jsonResponse({
            data: {
              label: 'Chino Roces Avenue, Makati',
              coordinates: { lat: 14.5608, lng: 121.0124 },
            },
          }),
        );
      }
      capturedSearchSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });

    const onSelectLocation = vi.fn();
    const { unmount } = render(
      <DeliveryLocationPicker
        selectedAddress={null}
        pin={null}
        outOfRange={false}
        distanceKm={null}
        onSelectLocation={onSelectLocation}
        onClearLocation={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: /delivery address/i });
    // Type query and immediately click Use my location before 250ms debounce fires
    fireEvent.change(input, { target: { value: 'Ayala' } });
    fireEvent.click(screen.getByRole('button', { name: /^use my location$/i }));

    await waitFor(() => {
      expect(onSelectLocation).toHaveBeenCalledWith(
        { lat: 14.5608, lng: 121.0124 },
        'Chino Roces Avenue, Makati',
      );
    });

    // Wait past debounce window to prove /location/search never fired
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes('/location/search'))).toBe(
      false,
    );
    expect(screen.queryByRole('listbox')).toBeNull();

    // Now start an in-flight search and unmount while it is pending -> signal aborts
    fireEvent.change(input, { target: { value: 'Makati' } });
    await waitFor(() => {
      expect(capturedSearchSignal).toBeTruthy();
    });
    expect(capturedSearchSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSearchSignal?.aborted).toBe(true);
  });
});

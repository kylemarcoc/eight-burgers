import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeliveryMapPicker from './DeliveryMapPicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DeliveryMapPicker', () => {
  it('exposes an accessible map region, persistent live regions, and validates empty search', () => {
    const onPinChange = vi.fn();
    render(<DeliveryMapPicker pin={null} maxDeliveryDistanceKm={25} onPinChange={onPinChange} />);

    expect(
      screen.getByRole('region', { name: /interactive metro manila delivery map/i }),
    ).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^find$/i }));
    expect(screen.getByRole('alert').textContent).toContain('Enter a street, condo, mall');
    expect(onPinChange).not.toHaveBeenCalled();
  });

  it('sends privacy-hardened Nominatim fetches, keeps Find accessible name with aria-busy, and rejects malformed payloads', async () => {
    const onPinChange = vi.fn();
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<DeliveryMapPicker pin={null} maxDeliveryDistanceKm={25} onPinChange={onPinChange} />);

    const searchInput = screen.getByLabelText(/pin delivery location/i);
    fireEvent.change(searchInput, { target: { value: 'Ayala Triangle' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    const findButton = screen.getByRole('button', { name: /^find$/i });
    expect(findButton.getAttribute('aria-busy')).toBe('true');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://nominatim.openstreetmap.org/search?'),
      expect.objectContaining({
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }),
    );

    // Resolve with malformed out-of-range coordinates & non-string display_name
    resolveFetch?.({
      ok: true,
      json: async () => [{ lat: '999', lon: '121.02', display_name: 12345 }],
    } as Response);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('No matching Metro Manila location');
    });
    expect(findButton.getAttribute('aria-busy')).toBe('false');
    expect(onPinChange).not.toHaveBeenCalled();
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
      <DeliveryMapPicker pin={null} maxDeliveryDistanceKm={25} onPinChange={onPinChange} />,
    );

    const locateBtn = screen.getByRole('button', { name: /^use my location$/i });
    fireEvent.click(locateBtn);
    expect(locateBtn.getAttribute('aria-busy')).toBe('true');

    unmount();
    savedSuccess?.({
      coords: {
        latitude: 14.5547,
        longitude: 121.0244,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    });

    expect(onPinChange).not.toHaveBeenCalled();
  });
});

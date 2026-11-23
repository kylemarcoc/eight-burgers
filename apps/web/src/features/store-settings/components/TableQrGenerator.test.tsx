import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { TableQrGenerator } from './TableQrGenerator';

const { toDataURLMock, toStringMock } = vi.hoisted(() => ({
  toDataURLMock: vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`),
  toStringMock: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: toDataURLMock,
    toString: toStringMock,
  },
}));

afterEach(() => {
  cleanup();
  toDataURLMock.mockClear();
  toStringMock.mockClear();
  vi.restoreAllMocks();
});

describe('TableQrGenerator', () => {
  it('generates scannable QR stickers for table ranges and custom labels, copies links, downloads SVG, and triggers print', async () => {
    installMockShopApi({
      authenticated: true,
      role: 'owner',
      initialStore: { dineInEnabled: true },
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-qr');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <TestQueryWrapper>
        <TableQrGenerator />
      </TestQueryWrapper>,
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Table 1' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Table 4' })).toBeTruthy();
    expect(screen.getByAltText('QR code for Table 1')).toBeTruthy();

    // Update range to a single table 7
    fireEvent.change(screen.getByLabelText(/from table/i), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/to table/i), { target: { value: '7' } });

    expect(await screen.findByRole('heading', { level: 3, name: 'Table 7' })).toBeTruthy();
    const expectedUrl = `${window.location.origin}/?fulfillment=dine-in&table=7`;

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expectedUrl);
      expect(screen.getByRole('button', { name: /^copied$/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /download svg/i }));
    await waitFor(() => {
      expect(toStringMock).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({ type: 'svg' }),
      );
      expect(createObjectURLSpy).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-qr');
    });

    fireEvent.click(screen.getByRole('button', { name: /print table stickers/i }));
    expect(printSpy).toHaveBeenCalledOnce();

    // Switch to custom comma-separated table labels
    fireEvent.change(screen.getByLabelText(/or custom labels/i), {
      target: { value: 'Patio 1, Bar 2' },
    });
    expect(await screen.findByRole('heading', { level: 3, name: 'Table Patio 1' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Table Bar 2' })).toBeTruthy();
  });

  it('shows a helpful notice when Dine-in is disabled and validates invalid table ranges', async () => {
    installMockShopApi({
      authenticated: true,
      role: 'owner',
      initialStore: { dineInEnabled: false },
    });

    render(
      <TestQueryWrapper>
        <TableQrGenerator />
      </TestQueryWrapper>,
    );

    expect(await screen.findByText(/dine-in is currently turned off above/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/from table/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/to table/i), { target: { value: '5' } });
    expect(
      screen.getByText(/end table number must be greater than or equal to start table/i),
    ).toBeTruthy();
  });
});

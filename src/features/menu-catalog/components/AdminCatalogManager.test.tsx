import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetShopStore } from '@/shared/store/useShopStore';
import { AdminCatalogManager } from './AdminCatalogManager';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetShopStore();
});

describe('AdminCatalogManager', () => {
  it('validates fields with aria-invalid/aria-describedby and rejects unsafe image URLs', () => {
    render(<AdminCatalogManager />);

    const nameInput = screen.getByLabelText(/item name/i);
    const priceInput = screen.getByLabelText(/price \(₱\)/i);
    const descInput = screen.getByLabelText(/ingredients & description/i);
    const imageInput = screen.getByLabelText(/image url/i);

    fireEvent.change(priceInput, { target: { value: '0' } });
    fireEvent.change(imageInput, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: /add item to menu/i }));

    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    expect(priceInput.getAttribute('aria-invalid')).toBe('true');
    expect(descInput.getAttribute('aria-invalid')).toBe('true');
    expect(imageInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/enter a valid https:\/\/ image url/i)).toBeTruthy();

    // Plaintext http:// and credentialed https:// URLs are also rejected
    fireEvent.change(imageInput, { target: { value: 'http://example.com/burger.webp' } });
    fireEvent.click(screen.getByRole('button', { name: /add item to menu/i }));
    expect(imageInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(imageInput, {
      target: { value: 'https://user:pass@example.com/burger.webp' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add item to menu/i }));
    expect(imageInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(nameInput, { target: { value: 'Smoked Bacon Burger' } });
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
  });

  it('edits listings, requires confirmation before deleting, and resets empty filters', () => {
    render(<AdminCatalogManager />);

    const editButton = screen.getByRole('button', { name: /edit mini cheese burger deluxe/i });
    fireEvent.click(editButton);
    expect(screen.getByText('Editing')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/price \(₱\)/i), { target: { value: '165' } });
    fireEvent.click(screen.getByRole('button', { name: /save listing changes/i }));
    expect(screen.getByRole('status').textContent).toContain('₱165');

    // Confirm delete flow
    fireEvent.click(screen.getByRole('button', { name: /delete burger deluxe/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete burger deluxe/i }));
    expect(screen.getByRole('status').textContent).toContain('Removed "Burger Deluxe"');

    // Empty filter state + reset
    fireEvent.change(screen.getByLabelText(/filter menu listings/i), {
      target: { value: 'no-such-burger' },
    });
    expect(screen.getByText('No listings match your current filter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /reset listing filters/i }));
    expect(screen.getByRole('heading', { level: 3, name: 'Chicano Burger' })).toBeTruthy();
  });

  it('requires confirmation before restoring the default menu', () => {
    render(<AdminCatalogManager />);

    fireEvent.click(screen.getByRole('button', { name: /delete burger deluxe/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete burger deluxe/i }));
    expect(screen.queryByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /restore default menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm restore/i }));

    expect(screen.getByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      'Restored the default 8Burgers Chino Roces menu.',
    );
  });

  it('configures free delivery threshold and manages delivery zones in the admin panel', () => {
    render(<AdminCatalogManager />);

    // Validate invalid threshold
    const minSubtotalInput = screen.getByLabelText(/min\. subtotal \(₱\)/i);
    fireEvent.change(minSubtotalInput, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save threshold/i }));
    expect(minSubtotalInput.getAttribute('aria-invalid')).toBe('true');

    // Save valid threshold
    fireEvent.change(minSubtotalInput, { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: /save threshold/i }));
    expect(screen.getByRole('status').textContent).toContain('₱600');

    // Validate invalid delivery zone form fields
    const zoneNameInput = screen.getByLabelText(/zone name/i);
    fireEvent.change(screen.getByLabelText(/max distance \(km\)/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/delivery fee \(₱\)/i), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText(/estimated eta/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /add delivery zone/i }));
    expect(zoneNameInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/max distance \(km\)/i).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/delivery fee \(₱\)/i).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/estimated eta/i).getAttribute('aria-invalid')).toBe('true');

    // Add a custom delivery zone
    fireEvent.change(zoneNameInput, {
      target: { value: 'Circuit & Olympia' },
    });
    fireEvent.change(screen.getByLabelText(/covered areas/i), {
      target: { value: 'Circuit Mall, AP Reyes' },
    });
    fireEvent.change(screen.getByLabelText(/max distance \(km\)/i), {
      target: { value: '4.5' },
    });
    fireEvent.change(screen.getByLabelText(/delivery fee \(₱\)/i), {
      target: { value: '55' },
    });
    fireEvent.change(screen.getByLabelText(/estimated eta/i), {
      target: { value: '20–30 min' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add delivery zone/i }));
    expect(screen.getByRole('status').textContent).toContain(
      'Added delivery zone "Circuit & Olympia"',
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Circuit & Olympia' })).toBeTruthy();

    // Pause, edit, and delete the zone with confirmation
    const pauseToggle = screen.getByRole('button', { name: /active — pause circuit & olympia/i });
    expect(pauseToggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pauseToggle);
    expect(screen.getByRole('status').textContent).toContain(
      'Paused delivery zone "Circuit & Olympia"',
    );
    expect(
      screen
        .getByRole('button', { name: /paused — activate circuit & olympia/i })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /edit zone circuit & olympia/i }));
    fireEvent.change(screen.getByLabelText(/delivery fee \(₱\)/i), {
      target: { value: '59' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save zone changes/i }));
    expect(screen.getByRole('status').textContent).toContain('₱59');

    fireEvent.click(screen.getByRole('button', { name: /delete zone circuit & olympia/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete zone circuit & olympia/i }));
    expect(screen.queryByRole('heading', { level: 3, name: 'Circuit & Olympia' })).toBeNull();

    // Restore default zones
    fireEvent.click(screen.getByRole('button', { name: /restore default zones/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm restore zones/i }));
    expect(screen.getByRole('status').textContent).toContain(
      'Restored default Metro Manila delivery zones and threshold.',
    );
  });
});

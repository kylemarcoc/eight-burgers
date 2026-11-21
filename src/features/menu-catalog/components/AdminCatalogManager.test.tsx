import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShopProvider } from '@/shared/shop/ShopProvider';
import { AdminCatalogManager } from './AdminCatalogManager';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('AdminCatalogManager', () => {
  it('validates fields with aria-invalid/aria-describedby and rejects unsafe image URLs', () => {
    render(
      <ShopProvider>
        <AdminCatalogManager />
      </ShopProvider>,
    );

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
    expect(screen.getByText(/enter a valid http:\/\/ or https:\/\/ image url/i)).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: 'Smoked Bacon Burger' } });
    expect(nameInput.getAttribute('aria-invalid')).toBe('false');
  });

  it('edits listings, requires confirmation before deleting, and resets empty filters', () => {
    render(
      <ShopProvider>
        <AdminCatalogManager />
      </ShopProvider>,
    );

    const editButtons = screen.getAllByRole('button', { name: /^edit$/i });
    const firstEditButton = editButtons[0];
    expect(firstEditButton).toBeTruthy();
    if (!firstEditButton) return;

    fireEvent.click(firstEditButton);
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
    render(
      <ShopProvider>
        <AdminCatalogManager />
      </ShopProvider>,
    );

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
});

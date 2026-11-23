import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminCategoriesManager } from './AdminCategoriesManager';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminCategoriesManager', () => {
  it('adds, edits, reorders via Move Up / Move Down, and guards CATEGORY_IN_USE on delete', async () => {
    const onStatusMessage = vi.fn();
    const { state } = installMockShopApi({ authenticated: true, role: 'owner' });

    render(
      <TestQueryWrapper>
        <AdminCategoriesManager onStatusMessage={onStatusMessage} />
      </TestQueryWrapper>,
    );

    expect(await screen.findByText('Classic Burgers')).toBeTruthy();

    // Add a new category
    fireEvent.change(screen.getByLabelText(/category name/i), {
      target: { value: 'Cold Brew' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add category$/i }));

    expect(await screen.findByText('Cold Brew')).toBeTruthy();
    expect(state.categories.some((cat) => cat.name === 'Cold Brew')).toBe(true);

    // Move Cold Brew up
    fireEvent.click(screen.getByRole('button', { name: /move cold brew up/i }));
    await waitFor(() => {
      const idx = state.categories.findIndex((cat) => cat.name === 'Cold Brew');
      expect(idx).toBe(3);
    });

    // Attempt to delete Classic Burgers (in use by items) -> 409 CATEGORY_IN_USE
    fireEvent.click(screen.getByRole('button', { name: /delete category classic burgers/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /confirm delete category classic burgers/i }),
    );

    await waitFor(() => {
      expect(onStatusMessage).toHaveBeenCalledWith(
        expect.stringMatching(/move or delete menu items assigned to this category/i),
        'error',
      );
    });
    expect(state.categories.some((cat) => cat.id === 'classic-burgers')).toBe(true);

    // Deleting unused Cold Brew succeeds
    fireEvent.click(screen.getByRole('button', { name: /delete category cold brew/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete category cold brew/i }));
    await waitFor(() => {
      expect(state.categories.some((cat) => cat.name === 'Cold Brew')).toBe(false);
    });
  });
});

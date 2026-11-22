import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminTeamManager } from './AdminTeamManager';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OWNER_ID = '11111111-1111-4111-8111-111111111111';

function renderTeamManager() {
  return render(
    <TestQueryWrapper>
      <AdminTeamManager currentUserId={OWNER_ID} />
    </TestQueryWrapper>,
  );
}

describe('AdminTeamManager', () => {
  it('lists accounts, registers a new Cashier, changes roles, and disables/re-enables access', async () => {
    installMockShopApi({ authenticated: true, role: 'owner' });
    renderTeamManager();

    expect(await screen.findByText('owner@eightburgers.local')).toBeTruthy();
    expect(screen.getByText('cashier@eightburgers.local')).toBeTruthy();
    expect(screen.getByText('staff@eightburgers.local')).toBeTruthy();
    expect(screen.getByText('Signed-in owner')).toBeTruthy();

    // Validation errors on invalid email and short password
    fireEvent.change(screen.getByLabelText(/staff email/i), {
      target: { value: 'invalid-email' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create team account/i }));
    expect(await screen.findByText(/enter a valid team email address/i)).toBeTruthy();
    expect(screen.getByText(/password must be at least 8 characters/i)).toBeTruthy();

    // Register a new Cashier
    fireEvent.change(screen.getByLabelText(/staff email/i), {
      target: { value: 'cashier2@eightburgers.local' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'CashierPass123!' },
    });
    fireEvent.change(screen.getByLabelText(/access role/i), {
      target: { value: 'cashier' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create team account/i }));

    expect(
      await screen.findByText(/created cashier account for cashier2@eightburgers\.local/i),
    ).toBeTruthy();
    expect(await screen.findByText('cashier2@eightburgers.local')).toBeTruthy();

    // Duplicate email rejected with server error message
    fireEvent.change(screen.getByLabelText(/staff email/i), {
      target: { value: 'cashier2@eightburgers.local' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'CashierPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create team account/i }));
    expect(await screen.findByText(/already registered/i)).toBeTruthy();

    // Change role of cashier2 to staff
    const roleSelect = screen.getByLabelText(/role for cashier2@eightburgers\.local/i);
    fireEvent.change(roleSelect, { target: { value: 'staff' } });
    expect(await screen.findByText(/updated cashier2@eightburgers\.local to staff/i)).toBeTruthy();

    // Disable and re-enable staff@eightburgers.local
    const disableButtons = screen.getAllByRole('button', { name: /disable access/i });
    const firstDisableButton = disableButtons[0];
    expect(firstDisableButton).toBeTruthy();
    if (firstDisableButton) {
      fireEvent.click(firstDisableButton);
    }

    expect(await screen.findByText(/disabled staff portal access for/i)).toBeTruthy();
    const reEnableButton = await screen.findByRole('button', { name: /re-enable access/i });
    fireEvent.click(reEnableButton);

    await waitFor(() => {
      expect(screen.getByText(/re-enabled staff portal access for/i)).toBeTruthy();
    });
  });
});

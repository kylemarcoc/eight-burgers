import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminLoginForm } from './AdminLoginForm';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderLoginForm() {
  return render(
    <TestQueryWrapper>
      <AdminLoginForm />
    </TestQueryWrapper>,
  );
}

describe('AdminLoginForm', () => {
  it('toggles password visibility without submitting the form and keeps natural tab order', () => {
    installMockShopApi({ authenticated: false });
    renderLoginForm();

    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
    const toggleButton = screen.getByRole('button', { name: /show password/i });

    expect(passwordInput.type).toBe('password');
    expect(passwordInput.getAttribute('spellcheck')).toBe('false');
    expect(passwordInput.getAttribute('autocapitalize')).toBe('none');
    expect(passwordInput.getAttribute('autocorrect')).toBe('off');
    expect(toggleButton.getAttribute('aria-controls')).toBe(passwordInput.id);
    expect(
      Boolean(
        passwordInput.compareDocumentPosition(toggleButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);

    fireEvent.change(passwordInput, { target: { value: 'SecretPass123!' } });
    fireEvent.click(toggleButton);

    expect(passwordInput.type).toBe('text');
    expect(passwordInput.value).toBe('SecretPass123!');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));

    expect(passwordInput.type).toBe('password');
    expect(screen.getByRole('button', { name: /show password/i })).toBeTruthy();
  });

  it('attributes validation errors to the offending field and clears stale client and server errors on edit', async () => {
    installMockShopApi({ authenticated: false });
    renderLoginForm();

    const emailInput = screen.getByLabelText(/staff email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'owner@eightburgers.local' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in to staff portal/i }));

    expect(screen.getByRole('alert').textContent).toMatch(/enter your staff portal password/i);
    expect(emailInput.getAttribute('aria-invalid')).toBe('false');
    expect(passwordInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(passwordInput, { target: { value: 'WrongPassword!' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(passwordInput.getAttribute('aria-invalid')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /sign in to staff portal/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    expect(passwordInput.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(passwordInput, { target: { value: 'EightBurgersDev123!' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(emailInput.getAttribute('aria-invalid')).toBe('false');
    expect(passwordInput.getAttribute('aria-invalid')).toBe('false');
  });

  it('preserves password input and visibility state on failed sign-in, then resets both on success', async () => {
    installMockShopApi({ authenticated: false });
    renderLoginForm();

    const emailInput = screen.getByLabelText(/staff email/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'owner@eightburgers.local' } });
    fireEvent.change(passwordInput, { target: { value: 'WrongPassword!' } });
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));

    expect(passwordInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /sign in to staff portal/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(passwordInput.value).toBe('WrongPassword!');
    expect(passwordInput.type).toBe('text');

    fireEvent.change(passwordInput, { target: { value: 'EightBurgersDev123!' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in to staff portal/i }));

    await waitFor(() => {
      expect(passwordInput.value).toBe('');
      expect(passwordInput.type).toBe('password');
    });
    expect(screen.getByRole('button', { name: /show password/i })).toBeTruthy();
  });

  it('ignores duplicate form submissions while a login request is already in flight', async () => {
    const pendingRequest: { resolve: ((response: Response) => void) | null } = { resolve: null };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingRequest.resolve = resolve;
        }),
    );

    const { container } = renderLoginForm();
    const form = container.querySelector('form');
    expect(form).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/staff email/i), {
      target: { value: 'owner@eightburgers.local' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'EightBurgersDev123!' },
    });

    if (form) {
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /signing in/i })).toBeTruthy();
      });
      fireEvent.submit(form);
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    pendingRequest.resolve?.(
      new Response(
        JSON.stringify({
          data: {
            authenticated: true,
            user: {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'owner@eightburgers.local',
              role: 'owner',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await waitFor(() => {
      expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('');
    });
  });
});

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { ThemeProvider } from './providers/ThemeProvider';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.dataset.uiTheme = 'light';
  window.history.replaceState({}, '', '/');
});

describe('8Burgers Storefront, Bottom-Right Cart Portal, and Admin', () => {
  it('renders the Chino Roces menu and switches themes', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /100g pure beef griddle burgers, made fresh on Chino Roces/i,
      }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Burger Deluxe' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Chicano Burger' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Overload Burger' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Crinkle Cut Fries' })).toBeTruthy();

    const themeButton = screen.getByRole('button', { name: /switch to dark theme/i });
    fireEvent.click(themeButton);
    expect(document.documentElement.dataset.uiTheme).toBe('dark');
  });

  it('adds, updates, removes, and buys orders via the bottom-right portal cart drawer', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    const burgerCard = screen
      .getByRole('heading', { level: 3, name: 'Burger Deluxe' })
      .closest('article');
    expect(burgerCard).toBeTruthy();
    if (!burgerCard) return;

    fireEvent.click(within(burgerCard).getByRole('button', { name: /add · ₱148/i }));

    const friesCard = screen
      .getByRole('heading', { level: 3, name: 'Crinkle Cut Fries' })
      .closest('article');
    expect(friesCard).toBeTruthy();
    if (!friesCard) return;

    fireEvent.click(within(friesCard).getByRole('button', { name: /add · ₱78/i }));

    const floatingCartButton = screen.getByRole('button', {
      name: /open cart with 2 items, subtotal ₱226/i,
    });
    fireEvent.click(floatingCartButton);

    const dialog = screen.getByRole('dialog', { name: /your order cart/i });
    expect(dialog).toBeTruthy();

    // Increment Burger Deluxe to 2x and remove Crinkle Cut Fries
    fireEvent.click(
      within(dialog).getByRole('button', { name: /increase quantity of burger deluxe/i }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: /remove crinkle cut fries from cart/i }),
    );

    expect(within(dialog).queryByText('Crinkle Cut Fries')).toBeNull();
    expect(within(dialog).getByRole('button', { name: /buy order · ₱296/i })).toBeTruthy();

    // Complete purchase
    fireEvent.change(within(dialog).getByLabelText(/your name/i), {
      target: { value: 'Marco' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /buy order · ₱296/i }));

    expect(within(dialog).getByText('Order Confirmed')).toBeTruthy();
    expect(within(dialog).getByText('#8B-101')).toBeTruthy();
  });

  it('allows the owner to add and update listings in /admin and reflects them on /', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('link', { name: /owner admin/i }));
    expect(
      screen.getByRole('heading', { level: 1, name: /owner menu & order manager/i }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/item name/i), {
      target: { value: 'Chino Roces Truffle Burger' },
    });
    fireEvent.change(screen.getByLabelText(/price \(₱\)/i), {
      target: { value: '248' },
    });
    fireEvent.change(screen.getByLabelText(/ingredients & description/i), {
      target: { value: '100g pure beef patty with roasted garlic truffle mayo.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /add item to menu/i }));
    expect(screen.getByRole('status').textContent).toContain('Chino Roces Truffle Burger');

    fireEvent.click(screen.getByRole('link', { name: /^menu$/i }));
    expect(
      screen.getByRole('heading', { level: 3, name: 'Chino Roces Truffle Burger' }),
    ).toBeTruthy();
  });

  it('renders a not-found page for unknown routes', () => {
    window.history.replaceState({}, '', '/unknown-route');
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACCENT_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ThemeProvider,
} from './ThemeProvider';
import { useTheme } from './theme-context';

function ThemeTestHarness() {
  const { theme, toggleTheme, accentPreset, setStoreAccent } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <span data-testid="accent-value">{accentPreset}</span>
      <button type="button" onClick={toggleTheme}>
        Toggle theme
      </button>
      <button type="button" onClick={() => setStoreAccent('matcha', null)}>
        Set matcha
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.dataset.uiTheme = 'light';
  document.documentElement.style.removeProperty('--ui-accent');
});

describe('ThemeProvider', () => {
  it('migrates legacy eight-burgers-theme to menu-kiosk-theme and purges the legacy key', () => {
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'dark');

    render(
      <ThemeProvider>
        <ThemeTestHarness />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-value').textContent).toBe('dark');
    expect(document.documentElement.dataset.uiTheme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(screen.getByTestId('theme-value').textContent).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it('persists store accent tokens to menu-kiosk-accent and updates root CSS variables', () => {
    render(
      <ThemeProvider>
        <ThemeTestHarness />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /set matcha/i }));
    expect(screen.getByTestId('accent-value').textContent).toBe('matcha');
    expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#2f6b3c');
    const savedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY) ?? '';
    expect(savedAccent).toContain('"preset":"matcha"');
  });
});

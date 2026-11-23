import {
  resolveStoreAccentTokens,
  storeAccentHexSchema,
  storeThemePresetSchema,
  type StoreThemePreset,
} from '@menu-kiosk/contracts';
import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './theme-context';

export const THEME_STORAGE_KEY = 'menu-kiosk-theme';
export const LEGACY_THEME_STORAGE_KEY = 'eight-burgers-theme';
export const ACCENT_STORAGE_KEY = 'menu-kiosk-accent';

type StoredAccentConfig = {
  preset: StoreThemePreset;
  customHex: string | null;
};

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      try {
        window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      } catch {
        // Ignore restricted storage removal errors.
      }
      return saved;
    }

    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy !== null) {
      if (legacy === 'light' || legacy === 'dark') {
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
        } catch {
          // Retain migrated theme in memory if storage quota is blocked.
        }
      }
      try {
        window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      } catch {
        // Ignore restricted storage removal errors.
      }
      if (legacy === 'light' || legacy === 'dark') return legacy;
    }
  } catch {
    // Storage access can be blocked in restricted browser contexts.
  }
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

function getInitialAccent(): StoredAccentConfig {
  if (typeof window === 'undefined') return { preset: 'ember', customHex: null };
  try {
    const raw = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    if (!raw) return { preset: 'ember', customHex: null };
    const parsed = JSON.parse(raw) as { preset?: unknown; customHex?: unknown };
    const presetResult = storeThemePresetSchema.safeParse(parsed.preset);
    if (!presetResult.success) return { preset: 'ember', customHex: null };
    const hexResult = storeAccentHexSchema.nullable().safeParse(parsed.customHex ?? null);
    return {
      preset: presetResult.data,
      customHex: hexResult.success ? hexResult.data : null,
    };
  } catch {
    return { preset: 'ember', customHex: null };
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [accent, setAccent] = useState<StoredAccentConfig>(getInitialAccent);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.uiTheme = theme;

    const resolved = resolveStoreAccentTokens(accent.preset, accent.customHex)[theme];
    root.style.setProperty('--ui-accent', resolved.accent);
    root.style.setProperty('--ui-accent-hover', resolved.accentHover);
    root.style.setProperty('--ui-on-accent', resolved.onAccent);
    root.style.setProperty('--ui-focus-color', resolved.focusColor);

    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.content = theme === 'dark' ? '#12100e' : '#faf6f0';
    }
  }, [theme, accent]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
        window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      } catch {
        // Ignore storage errors and keep the in-memory theme state.
      }
      return next;
    });
  }, []);

  const setStoreAccent = useCallback((preset: StoreThemePreset, customHex: string | null) => {
    const normalizedHex = customHex ? customHex.trim().toLowerCase() : null;
    setAccent((prev) => {
      if (prev.preset === preset && prev.customHex === normalizedHex) {
        return prev;
      }
      return { preset, customHex: normalizedHex };
    });

    try {
      const resolvedPair = resolveStoreAccentTokens(preset, normalizedHex);
      window.localStorage.setItem(
        ACCENT_STORAGE_KEY,
        JSON.stringify({
          preset,
          customHex: normalizedHex,
          light: resolvedPair.light,
          dark: resolvedPair.dark,
        }),
      );
    } catch {
      // Ignore storage errors and keep in-memory accent tokens active.
    }
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      accentPreset: accent.preset,
      accentHex: accent.customHex,
      setStoreAccent,
    }),
    [theme, toggleTheme, accent.preset, accent.customHex, setStoreAccent],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

import type { StoreThemePreset } from '@menu-kiosk/contracts';
import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  accentPreset: StoreThemePreset;
  accentHex: string | null;
  setStoreAccent: (preset: StoreThemePreset, customHex: string | null) => void;
};

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

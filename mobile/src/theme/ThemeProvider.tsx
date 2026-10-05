import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { DEFAULT_PREFERENCE, resolveMode, type ThemePreference } from './preference';
import { palettes, radius, space, typeScale, type ColorTokens, type Mode } from './tokens';

type ThemeValue = {
  mode: Mode;
  colors: ColorTokens;
  type: typeof typeScale;
  radius: typeof radius;
  space: typeof space;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

// Holds the user's theme choice and exposes the resolved palette.
// The choice lives in memory for now; it is saved on the device once the local store exists (Phase 2).
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  const mode = resolveMode(preference, system);

  const value = useMemo<ThemeValue>(
    () => ({ mode, colors: palettes[mode], type: typeScale, radius, space, preference, setPreference }),
    [mode, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}

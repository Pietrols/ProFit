import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { kvStore } from '@/lib/storage/local';
import { PREFERENCE_KEY, parsePreference, resolveMode, type ThemePreference } from './preference';
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

// Holds the user's theme choice and exposes the resolved palette. The choice is saved on the phone;
// nothing renders until it has been read, so the splash screen covers the moment and a light-theme
// user never sees a dark flash.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);

  useEffect(() => {
    kvStore.getItem(PREFERENCE_KEY).then(
      (raw) => setPreferenceState(parsePreference(raw)),
      () => setPreferenceState(parsePreference(null)),
    );
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void kvStore.setItem(PREFERENCE_KEY, next).catch(() => {});
  }, []);

  const resolved = preference ?? parsePreference(null);
  const mode = resolveMode(resolved, system);
  const value = useMemo<ThemeValue>(
    () => ({ mode, colors: palettes[mode], type: typeScale, radius, space, preference: resolved, setPreference }),
    [mode, resolved, setPreference],
  );

  if (!preference) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}
